import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, authApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Avatar, Button, Card, Field } from '../components/ui';
import { formatDate } from '../lib/format';

const BLOCKS = ['A', 'B', 'C', 'D', 'E', 'Hostel-1', 'Hostel-2', 'Off-campus'];

export function ProfilePage() {
  const { user, updateProfile, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [profile, setProfile] = useState({ name: user?.name ?? '', phone: user?.phone ?? '', block: user?.block ?? 'A' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setSavingProfile(true);
    setError(null);
    try {
      await updateProfile({ name: profile.name.trim(), phone: profile.phone.trim() || undefined, block: profile.block });
      toast.success('Profile updated.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (passwords.newPassword !== passwords.confirm) {
      setError('New passwords do not match.');
      return;
    }
    setSavingPassword(true);
    setError(null);
    try {
      await authApi.changePassword(passwords.currentPassword, passwords.newPassword);
      setPasswords({ currentPassword: '', newPassword: '', confirm: '' });
      toast.success('Password changed.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change your password.');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="page__stack page__stack--narrow">
      <header className="profile-head">
        <Avatar name={user.name} color={user.avatarColor} />
        <div>
          <h1 className="page__title">{user.name}</h1>
          <p className="page__sub">{user.email}</p>
          <p className="muted">
            {user.role === 'student' ? `Student · ${user.studentId ?? 'No ID'} · Block ${user.block ?? '—'}` : 'Administrator'}
          </p>
        </div>
      </header>

      {error && <div className="alert alert--error">{error}</div>}

      <Card title="Personal details">
        <form className="stack" onSubmit={saveProfile}>
          <Field label="Full name" name="name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} required />
          <Field label="Phone" name="phone" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
          <label className="field">
            <span className="field__label">Hostel / block</span>
            <select className="input select" value={profile.block} onChange={(e) => setProfile({ ...profile, block: e.target.value })}>
              {BLOCKS.map((block) => (
                <option key={block} value={block}>
                  {block}
                </option>
              ))}
            </select>
          </label>
          <Field label="College email" name="email" value={user.email} disabled hint="Email is your login and cannot be changed here." />
          <Button type="submit" loading={savingProfile}>
            Save changes
          </Button>
        </form>
      </Card>

      <Card title="Security" subtitle="Use at least 8 characters with a letter and a number.">
        <form className="stack" onSubmit={savePassword}>
          <Field
            label="Current password"
            type="password"
            name="currentPassword"
            autoComplete="current-password"
            value={passwords.currentPassword}
            onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
            required
          />
          <Field
            label="New password"
            type="password"
            name="newPassword"
            autoComplete="new-password"
            value={passwords.newPassword}
            onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
            required
          />
          <Field
            label="Confirm new password"
            type="password"
            name="confirm"
            autoComplete="new-password"
            value={passwords.confirm}
            onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
            required
          />
          <Button type="submit" loading={savingPassword}>
            Update password
          </Button>
        </form>
      </Card>

      <Card title="Account">
        <dl className="kv">
          <div>
            <dt>Member since</dt>
            <dd>{formatDate(user.createdAt)}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{user.isActive ? 'Active' : 'Blocked'}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>{user.role}</dd>
          </div>
        </dl>
        <Button
          variant="danger"
          onClick={async () => {
            await logout();
            navigate('/login');
          }}
        >
          Sign out
        </Button>
      </Card>
    </div>
  );
}