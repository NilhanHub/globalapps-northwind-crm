import { useState } from 'react';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, RelationshipThread, Input, Label, Field, FieldError, Alert } from '@northwind/ui';
import { useAuth } from '../auth';

const loginSchema = z.object({
  username: z.string().min(1, { message: 'Username is required' }),
  password: z.string().min(12, { message: 'Password must be at least 12 characters' }),
});

type LoginSchema = z.infer<typeof loginSchema>;

export function LoginPage() {
  const auth = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginSchema>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

  async function onSubmit(values: LoginSchema) {
    setBusy(true);
    setError('');
    try {
      await auth.login(values.username, values.password);
    } catch {
      setError('Username or password is incorrect.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand brand--login">
          <span className="brand-mark">N</span>
          <span className="brand-word">Northwind</span>
        </div>
        <div className="login-story__copy">
          <span className="page-eyebrow">Relationship intelligence</span>
          <h1>
            Warm paths.
            <br />
            Clear next moves.
          </h1>
          <p>A focused operating desk for turning trusted relationships into useful conversations.</p>
        </div>
        <RelationshipThread target="Target" mutual="Trusted mutual" owner="Owner" stage="Next move" />
        <footer>Private workspace · Auditable actions · Recoverable history</footer>
      </section>
      <section className="login-panel">
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="login-lock">
            <LockKeyhole size={20} />
          </div>
          <span className="panel-eyebrow">Secure shared access</span>
          <h2>Welcome back</h2>
          <p>Sign in to open the Northwind relationship desk.</p>

          {auth.logoutReason === 'idle_timeout' && (
            <Alert variant="info" className="mb-4">
              You were automatically logged out after 16 hours of inactivity. Please sign in again.
            </Alert>
          )}

          {error && (
            <Alert variant="danger" className="nw-login-error mb-4">
              {error}
            </Alert>
          )}

          <div className="flex flex-col gap-4 mb-5">
            <Field>
              <Label htmlFor="username">Username</Label>
              <Input id="username" autoComplete="username" autoFocus {...register('username')} />
              {errors.username && <FieldError>{errors.username.message}</FieldError>}
            </Field>

            <Field>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
              {errors.password && <FieldError>{errors.password.message}</FieldError>}
            </Field>
          </div>

          <Button disabled={busy} type="submit">
            {busy ? 'Opening desk…' : 'Open Northwind'}
            <ArrowRight size={16} className="ml-2" />
          </Button>
        </form>
      </section>
    </main>
  );
}
