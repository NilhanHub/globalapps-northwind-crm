import { useState, type FormEvent } from 'react';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { Button, RelationshipThread } from '@northwind/ui';
import { useAuth } from '../auth';

export function LoginPage() {
  const auth = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      await auth.login(String(data.get('username')), String(data.get('password')));
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
        <form onSubmit={submit}>
          <div className="login-lock">
            <LockKeyhole size={20} />
          </div>
          <span className="panel-eyebrow">Secure shared access</span>
          <h2>Welcome back</h2>
          <p>Sign in to open the Northwind relationship desk.</p>
          {error ? (
            <div className="form-alert" role="alert">
              {error}
            </div>
          ) : null}
          <label>
            Username
            <input name="username" autoComplete="username" required autoFocus />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" minLength={12} required />
          </label>
          <Button disabled={busy} type="submit">
            {busy ? 'Opening desk…' : 'Open Northwind'}
            <ArrowRight size={16} />
          </Button>
        </form>
      </section>
    </main>
  );
}
