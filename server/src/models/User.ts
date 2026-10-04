import mongoose, { Schema, type Model, type Types } from 'mongoose';
import { USER_ROLES, type UserRole } from '../constants';

export interface IUser {
  name: string;
  email: string;
  passwordHash: string;
  phone?: string;
  studentId?: string;
  role: UserRole;
  isBlocked: boolean;
  blockedReason?: string;
  lastLoginAt?: Date;
  avatarColor: string;
  notificationEmail: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address'],
    },
    passwordHash: { type: String, required: true, select: false },
    phone: { type: String, trim: true, maxlength: 20 },
    studentId: { type: String, trim: true, maxlength: 40, index: true },
    role: { type: String, enum: USER_ROLES, default: 'student', index: true },
    isBlocked: { type: Boolean, default: false, index: true },
    blockedReason: { type: String, maxlength: 300 },
    lastLoginAt: { type: Date },
    avatarColor: { type: String, default: '#6366f1' },
    notificationEmail: { type: Boolean, default: true },
  },
  { timestamps: true },
);

userSchema.methods.toJSON = function toJSON(this: mongoose.Document<IUser>) {
  const obj = this.toObject({ versionKey: false }) as Record<string, unknown>;
  delete obj.passwordHash;
  obj.id = String(obj._id);
  delete obj._id;
  return obj;
};

export type UserDocument = HydratedDocument<IUser> & { wallet?: Types.ObjectId };
type HydratedDocument<T> = mongoose.HydratedDocument<T>;

export const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', userSchema);