import type { Request, Response } from 'express';
import type { HydratedDocument } from 'mongoose';
import { User, Wallet, type IUser } from '../models';
import { ApiError, asyncHandler } from '../utils/ApiError';
import { clearAuthCookie, setAuthCookie } from '../middleware/auth';
import { getOrCreateWallet, getWalletSummary } from '../services/wallet.service';
import { signAccessToken, hashPassword, verifyPassword } from '../utils/auth';
import { randomToken } from '../utils/tokens';

const AVATAR_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

function issueSession(res: Response, user: HydratedDocument<IUser>) {
  const token = signAccessToken({ sub: String(user._id), role: user.role, email: user.email, name: user.name });
  setAuthCookie(res, token);
  return token;
}

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password, phone, studentId } = req.body as {
    name: string;
    email: string;
    password: string;
    phone?: string;
    studentId?: string;
  };

  const existing = await User.findOne({ email }).select('_id').lean();
  if (existing) throw ApiError.conflict('An account with this email already exists. Please sign in instead.');

  const passwordHash = await hashPassword(password);
  const user = await User.create({
    name,
    email,
    passwordHash,
    phone,
    studentId,
    role: 'student',
    avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
  });

  await getOrCreateWallet(user._id);
  const token = issueSession(res, user);

  res.status(201).json({
    user: user.toJSON(),
    wallet: await getWalletSummary(user._id),
    token,
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, role } = req.body as { email: string; password: string; role: 'student' | 'admin' };

  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user) {
    // Spend the same time as a real comparison to limit user enumeration via timing.
    await verifyPassword(password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    throw ApiError.unauthorized('Incorrect email or password.');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw ApiError.unauthorized('Incorrect email or password.');

  if (user.role !== role) {
    throw ApiError.forbidden(
      role === 'admin'
        ? 'This account does not have canteen admin access.'
        : 'Please use the canteen admin portal to sign in with this account.',
    );
  }
  if (user.isBlocked) throw ApiError.forbidden(user.blockedReason || 'Your account has been suspended.');

  user.lastLoginAt = new Date();
  await user.save();

  const token = issueSession(res, user);
  const wallet = await getWalletSummary(user._id);

  res.json({ user: user.toJSON(), wallet, token });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw ApiError.notFound('Account not found.');
  res.json({ user: user.toJSON(), wallet: await getWalletSummary(user._id) });
});

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  clearAuthCookie(res);
  res.json({ success: true, message: 'Signed out successfully.' });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const patch = req.body as Partial<Pick<IUser, 'name' | 'phone' | 'studentId' | 'notificationEmail'>>;
  const user = await User.findByIdAndUpdate(req.user!.id, { $set: patch }, { new: true, runValidators: true });
  if (!user) throw ApiError.notFound('Account not found.');
  res.json({ user: user.toJSON(), message: 'Profile updated.' });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  const user = await User.findById(req.user!.id).select('+passwordHash');
  if (!user) throw ApiError.notFound('Account not found.');

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) throw ApiError.badRequest('Your current password is incorrect.');

  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  res.json({ success: true, message: 'Password updated successfully.' });
});

export const deleteAccount = asyncHandler(async (req: Request, res: Response) => {
  const { password } = req.body as { password: string };
  const user = await User.findById(req.user!.id).select('+passwordHash');
  if (!user) throw ApiError.notFound('Account not found.');

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw ApiError.badRequest('Password is incorrect.');

  const { Order } = await import('../models');
  const openOrders = await Order.countDocuments({
    user: user._id,
    status: { $in: ['PENDING_PAYMENT', 'PAID', 'ACCEPTED', 'PREPARING', 'READY'] },
  });
  if (openOrders > 0) throw ApiError.conflict('You still have active orders. Please wait until they are completed.');

  const wallet = await Wallet.findOne({ user: user._id }).lean();
  if (wallet && wallet.balance > 0) {
    throw ApiError.conflict('Your wallet still has a balance. Please contact the canteen admin to withdraw it.');
  }

  await Promise.all([user.deleteOne(), Wallet.deleteMany({ user: user._id })]);
  clearAuthCookie(res);
  res.json({ success: true, message: 'Your account has been deleted.' });
});

/** Rotates the JWT so the client can silently refresh its session token. */
export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw ApiError.unauthorized('Account not found.');
  if (user.isBlocked) throw ApiError.forbidden(user.blockedReason || 'Your account has been suspended.');
  const token = issueSession(res, user);
  res.json({ token, user: user.toJSON() });
});

/** Small helper used by the student profile page to preview a token sample. */
export const sampleToken = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ token: randomToken(4) });
});