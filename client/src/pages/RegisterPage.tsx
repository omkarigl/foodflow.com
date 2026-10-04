import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button, Field } from '../components/ui';

const BLOCKS = ['A', 'B', 'C', 'D', 'E', 'Hostel-1', 'Hostel-2', 'Off-campus'];

export function RegisterPage() {
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirm: '',
    phone: '',
    studentId: '',
    block: 'A',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const user = await register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || undefined,
        studentId: form.studentId.trim() || undefined,
        block: form.block,
      });
      toast.success(`Account ready, ${user.name.split(' ')[0]}. Find a QR code to order!`);
      navigate('/scan', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create your account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__panel auth__panel--wide">
        <Link to="/" className="auth__brand">
          <span aria-hidden="true">🍽️</span> FoodFlow
        </Link>
        <h1 className="auth__title">Create your student account</h1>
        <p className="auth__sub">One account for every canteen on campus.</p>

        <form className="auth__form auth__form--grid" onSubmit={submit} noValidate>
          <Field label="Full name" name="name" placeholder="Aarav Sharma" value={form.name} onChange={(e) => set('name')(e.target.value)} required />
          <Field label="College email" type="email" name="email" placeholder="you@college.edu" value={form.email} onChange={(e) => set('email')(e.target.value)} required />
          <Field
            label="Password"
            type="password"
            name="password"
            hint="At least 8 characters, with one letter and one number."
            value={form.password}
            onChange={(e) => set('password')(e.target.value)}
            required
          />
          <Field label="Confirm password" type="password" name="confirm" value={form.confirm} onChange={(e) => set('confirm')(e.target.value)} required />
          <Field label="Student ID" name="studentId" placeholder="CS24B1007" value={form.studentId} onChange={(e) => set('studentId')(e.target.value)} />
          <Field label="Phone" name="phone" placeholder="98765 43210" value={form.phone} onChange={(e) => set('phone')(e.target.value)} />
          <label className="field">
            <span className="field__label">Hostel / block</span>
            <select className="input select" value={form.block} onChange={(e) => set('block')(e.target.value)}>
              {BLOCKS.map((block) => (
                <option key={block} value={block}>
                  {block}
                </option>
              ))}
            </select>
          </label>

          {error && <div className="alert alert--error auth__span">{error}</div>}

          <Button type="submit" full size="lg" loading={busy} className="auth__span">
            Create account
          </Button>
        </form>

        <p className="auth__switch">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}