'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function ActualizarContrasenaPage() {
  const [password, setPassword] = useState('');
  const [confirmarPassword, setConfirmarPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  function validarPassword(passwordValue: string) {
    if (passwordValue.length < 8) {
      return 'La contraseña debe tener mínimo 8 caracteres.';
    }

    if (!/[A-Z]/.test(passwordValue)) {
      return 'La contraseña debe incluir al menos una letra mayúscula.';
    }

    if (!/[0-9]/.test(passwordValue)) {
      return 'La contraseña debe incluir al menos un número.';
    }

    return '';
  }

  async function manejarActualizarPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMensaje('');
    setError('');

    const errorPassword = validarPassword(password);

    if (errorPassword) {
      setError(errorPassword);
      return;
    }

    if (password !== confirmarPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setCargando(true);

    const { error } = await supabase.auth.updateUser({
      password,
    });

    setCargando(false);

    if (error) {
      setError('No fue posible actualizar la contraseña. Intenta abrir nuevamente el enlace del correo.');
      return;
    }

    setMensaje('Contraseña actualizada correctamente. Ya puedes iniciar sesión.');
    setPassword('');
    setConfirmarPassword('');

    setTimeout(() => {
      window.location.href = '/auth';
    }, 1800);
  }

  return (
    <main style={styles.main}>
      <section style={styles.card}>
        <h1 style={styles.title}>Actualizar contraseña</h1>

        <p style={styles.subtitle}>
          Crea una nueva contraseña para tu cuenta.
        </p>

        <form onSubmit={manejarActualizarPassword} style={styles.form}>
          <label style={styles.label}>Nueva contraseña</label>

          <div style={styles.passwordWrapper}>
            <input
              type={mostrarPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              style={styles.passwordInput}
            />

            <button
              type="button"
              onClick={() => setMostrarPassword(!mostrarPassword)}
              style={styles.eyeButton}
            >
              {mostrarPassword ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>

          <label style={styles.label}>Confirmar contraseña</label>

          <div style={styles.passwordWrapper}>
            <input
              type={mostrarConfirmacion ? 'text' : 'password'}
              value={confirmarPassword}
              onChange={(e) => setConfirmarPassword(e.target.value)}
              placeholder="Repite la contraseña"
              style={styles.passwordInput}
            />

            <button
              type="button"
              onClick={() => setMostrarConfirmacion(!mostrarConfirmacion)}
              style={styles.eyeButton}
            >
              {mostrarConfirmacion ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>

          <p style={styles.passwordHint}>
            La contraseña debe tener mínimo 8 caracteres, una mayúscula y un número.
          </p>

          <button type="submit" disabled={cargando} style={styles.primaryButton}>
            {cargando ? 'Actualizando...' : 'Actualizar contraseña'}
          </button>
        </form>

        {mensaje && <div style={styles.success}>{mensaje}</div>}
        {error && <div style={styles.error}>{error}</div>}
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f4f6f8',
    padding: '24px',
    fontFamily: 'Arial, sans-serif',
  },
  card: {
    width: '100%',
    maxWidth: '440px',
    background: '#ffffff',
    borderRadius: '18px',
    padding: '28px',
    boxShadow: '0 18px 45px rgba(0,0,0,0.08)',
  },
  title: {
    margin: 0,
    fontSize: '28px',
    color: '#111827',
  },
  subtitle: {
    marginTop: '8px',
    color: '#6b7280',
    fontSize: '14px',
    marginBottom: '24px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  label: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#374151',
    marginTop: '6px',
  },
  passwordWrapper: {
    display: 'flex',
    alignItems: 'center',
    border: '1px solid #d1d5db',
    borderRadius: '10px',
    overflow: 'hidden',
  },
  passwordInput: {
    flex: 1,
    height: '44px',
    border: 'none',
    padding: '0 12px',
    fontSize: '15px',
    outline: 'none',
  },
  eyeButton: {
    height: '44px',
    border: 'none',
    background: '#f3f4f6',
    padding: '0 12px',
    cursor: 'pointer',
    fontWeight: 600,
    color: '#374151',
  },
  primaryButton: {
    height: '46px',
    border: 'none',
    borderRadius: '10px',
    background: '#2563eb',
    color: '#ffffff',
    fontWeight: 700,
    fontSize: '15px',
    cursor: 'pointer',
    marginTop: '12px',
  },
  passwordHint: {
    fontSize: '12px',
    color: '#6b7280',
    margin: '4px 0 0',
  },
  success: {
    marginTop: '18px',
    padding: '12px',
    borderRadius: '10px',
    background: '#dcfce7',
    color: '#166534',
    fontSize: '14px',
  },
  error: {
    marginTop: '18px',
    padding: '12px',
    borderRadius: '10px',
    background: '#fee2e2',
    color: '#991b1b',
    fontSize: '14px',
  },
};