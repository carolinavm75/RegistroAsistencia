'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type ModoAuth = 'login' | 'registro';

type ProfesorRegistro = {
  profesor_id: string;
  profesor_nombre: string;
  profesor_correo: string;
};

export default function AuthPage() {
  const [modo, setModo] = useState<ModoAuth>('login');

  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [confirmarPassword, setConfirmarPassword] = useState('');

  const [mostrarPassword, setMostrarPassword] = useState(false);

  const [cargando, setCargando] = useState(false);
  const [validandoSesion, setValidandoSesion] = useState(true);

  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    validarSesionActual();
  }, []);

  async function validarSesionActual() {
    setValidandoSesion(true);

    const { data } = await supabase.auth.getSession();
    const email = data.session?.user.email;

    if (email) {
      const puedeEntrar = await validarProfesorActivo(email);

      if (puedeEntrar) {
        window.location.href = '/inicio';
        return;
      }

      await supabase.auth.signOut();
    }

    setValidandoSesion(false);
  }

  async function validarProfesorActivo(email: string) {
    const correoNormalizado = email.trim().toLowerCase();

    const { data, error } = await supabase
      .from('profesores')
      .select('id, nombre, correo, estado')
      .eq('correo', correoNormalizado)
      .eq('estado', true)
      .maybeSingle();

    if (error || !data) {
      return false;
    }

    return true;
  }

  async function iniciarSesion(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError('');
    setMensaje('');

    const correoNormalizado = correo.trim().toLowerCase();

    if (!correoNormalizado) {
      setError('Escribe tu correo.');
      return;
    }

    if (!password) {
      setError('Escribe tu contraseña.');
      return;
    }

    setCargando(true);

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: correoNormalizado,
      password,
    });

    if (loginError) {
      setCargando(false);
      setError('Correo o contraseña incorrectos.');
      return;
    }

    const puedeEntrar = await validarProfesorActivo(correoNormalizado);

    if (!puedeEntrar) {
      await supabase.auth.signOut();
      setCargando(false);
      setError(
        'Tu usuario existe, pero tu correo no está activo en la tabla de profesores.'
      );
      return;
    }

    window.location.href = '/inicio';
  }

  async function registrarUsuario(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError('');
    setMensaje('');

    const correoNormalizado = correo.trim().toLowerCase();

    if (!correoNormalizado) {
      setError('Escribe tu correo.');
      return;
    }

    if (!password) {
      setError('Escribe una contraseña.');
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener mínimo 6 caracteres.');
      return;
    }

    if (password !== confirmarPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setCargando(true);

    const { data: profesorValido, error: profesorError } = await supabase.rpc(
      'validar_profesor_para_registro',
      {
        p_correo: correoNormalizado,
      }
    );

    if (profesorError) {
      setCargando(false);
      setError(`No fue posible validar el profesor: ${profesorError.message}`);
      return;
    }

    const profesores = (profesorValido || []) as ProfesorRegistro[];

    if (profesores.length === 0) {
      setCargando(false);
      setError(
        'Este correo no está autorizado. El administrador debe crear primero el profesor.'
      );
      return;
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: correoNormalizado,
      password,
    });

    if (signUpError) {
      setCargando(false);

      if (signUpError.message.toLowerCase().includes('already registered')) {
        setError('Este correo ya tiene usuario. Intenta iniciar sesión.');
      } else {
        setError(signUpError.message);
      }

      return;
    }

    setCargando(false);

    if (signUpData.session) {
      window.location.href = '/inicio';
      return;
    }

    setMensaje(
      'Usuario creado correctamente. Revisa tu correo para confirmar la cuenta antes de iniciar sesión.'
    );

    setModo('login');
    setPassword('');
    setConfirmarPassword('');
  }

  async function recuperarPassword() {
    setError('');
    setMensaje('');

    const correoNormalizado = correo.trim().toLowerCase();

    if (!correoNormalizado) {
      setError('Escribe tu correo para recuperar la contraseña.');
      return;
    }

    setCargando(true);

    const { error } = await supabase.auth.resetPasswordForEmail(
      correoNormalizado
    );

    setCargando(false);

    if (error) {
      setError(`No fue posible enviar el correo: ${error.message}`);
      return;
    }

    setMensaje('Te enviamos un correo para recuperar tu contraseña.');
  }

  function cambiarModo(nuevoModo: ModoAuth) {
    setModo(nuevoModo);
    setError('');
    setMensaje('');
    setPassword('');
    setConfirmarPassword('');
  }

  if (validandoSesion) {
    return (
      <main className="page">
        <section className="shell">
          <section className="loading-card">
            <div className="brand-mark">ECI</div>
            <h1>Asistencia de Estudiantes</h1>
            <p>Cargando...</p>
          </section>
        </section>

        <style>{estilos}</style>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="shell">
        <header className="brand-header">
          <div className="brand-mark">ECI</div>

          <div>
            <p className="brand-name">Asistencia de Estudiantes</p>
            <p className="brand-subtitle">Escuela Colombiana de Ingeniería</p>
          </div>
        </header>

        <section className="hero">
          <p className="overline">
            {modo === 'login' ? 'Inicio de sesión' : 'Registro'}
          </p>

          <h1>{modo === 'login' ? 'Bienvenido' : 'Crear usuario'}</h1>
        </section>

        <section className="auth-card">
          <div className="tabs">
            <button
              className={modo === 'login' ? 'active' : ''}
              onClick={() => cambiarModo('login')}
            >
              Ingresar
            </button>

            <button
              className={modo === 'registro' ? 'active' : ''}
              onClick={() => cambiarModo('registro')}
            >
              Registrarse
            </button>
          </div>

          {error && <div className="error-message">{error}</div>}
          {mensaje && <div className="success-message">{mensaje}</div>}

          <form
            className="form"
            onSubmit={modo === 'login' ? iniciarSesion : registrarUsuario}
          >
            <label className="field">
              <span>Correo</span>

              <input
                type="email"
                value={correo}
                placeholder="correo@escuelaing.edu.co"
                autoComplete="email"
                onChange={(e) => setCorreo(e.target.value)}
              />
            </label>

            <label className="field">
              <span>Contraseña</span>

              <div className="password-box">
                <input
                  type={mostrarPassword ? 'text' : 'password'}
                  value={password}
                  placeholder="Contraseña"
                  autoComplete={
                    modo === 'login' ? 'current-password' : 'new-password'
                  }
                  onChange={(e) => setPassword(e.target.value)}
                />

                <button
                  type="button"
                  onClick={() => setMostrarPassword(!mostrarPassword)}
                >
                  {mostrarPassword ? 'Ocultar' : 'Ver'}
                </button>
              </div>
            </label>

            {modo === 'registro' && (
              <label className="field">
                <span>Confirmar contraseña</span>

                <input
                  type={mostrarPassword ? 'text' : 'password'}
                  value={confirmarPassword}
                  placeholder="Repite la contraseña"
                  autoComplete="new-password"
                  onChange={(e) => setConfirmarPassword(e.target.value)}
                />
              </label>
            )}

            <button type="submit" className="primary-button" disabled={cargando}>
              {cargando
                ? 'Procesando...'
                : modo === 'login'
                  ? 'Ingresar'
                  : 'Crear usuario'}
            </button>
          </form>

          {modo === 'login' && (
            <button
              type="button"
              className="link-button"
              onClick={recuperarPassword}
              disabled={cargando}
            >
              Olvidé mi contraseña
            </button>
          )}
        </section>
      </section>

      <style>{estilos}</style>
    </main>
  );
}

const estilos = `
  * {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    padding: 0;
    background: #111111;
    font-family: Arial, Helvetica, sans-serif;
  }

  .page {
    min-height: 100vh;
    background:
      radial-gradient(circle at top right, rgba(200, 16, 46, 0.35), transparent 30%),
      linear-gradient(180deg, #111111 0%, #111111 34%, #f4f4f4 34%, #f4f4f4 100%);
    color: #111111;
  }

  .shell {
    width: 100%;
    max-width: 540px;
    min-height: 100vh;
    margin: 0 auto;
    padding: 24px 16px 28px;
  }

  .brand-header {
    display: flex;
    align-items: center;
    gap: 12px;
    color: #ffffff;
    padding: 8px 0 34px;
  }

  .brand-mark {
    width: 52px;
    height: 52px;
    border-radius: 16px;
    background: #c8102e;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 900;
    letter-spacing: 1px;
    flex-shrink: 0;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.25);
  }

  .brand-name {
    margin: 0;
    font-size: 14px;
    font-weight: 900;
    line-height: 1.15;
  }

  .brand-subtitle {
    margin: 4px 0 0;
    font-size: 12px;
    color: #d1d5db;
  }

  .hero {
    color: #ffffff;
    padding: 0 0 28px;
  }

  .overline {
    margin: 0 0 10px;
    border-left: 5px solid #c8102e;
    padding-left: 10px;
    text-transform: uppercase;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 0.9px;
  }

  .hero h1 {
    margin: 0;
    font-size: 42px;
    line-height: 1;
    font-weight: 900;
    letter-spacing: -1px;
  }

  .auth-card,
  .loading-card {
    background: #ffffff;
    border-radius: 26px;
    padding: 22px;
    box-shadow: 0 20px 55px rgba(0, 0, 0, 0.18);
    border-top: 7px solid #c8102e;
  }

  .loading-card {
    margin-top: 120px;
    text-align: center;
  }

  .loading-card .brand-mark {
    margin: 0 auto 16px;
  }

  .loading-card h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 900;
  }

  .loading-card p {
    margin: 10px 0 0;
    color: #666666;
    font-size: 14px;
  }

  .tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    background: #f4f4f4;
    padding: 6px;
    border-radius: 18px;
    margin-bottom: 18px;
  }

  .tabs button {
    height: 42px;
    border: none;
    border-radius: 14px;
    background: transparent;
    color: #111111;
    font-size: 13px;
    font-weight: 900;
    cursor: pointer;
  }

  .tabs button.active {
    background: #111111;
    color: #ffffff;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .field span {
    font-size: 13px;
    font-weight: 900;
    color: #222222;
  }

  .field input,
  .password-box input {
    width: 100%;
    height: 50px;
    border: 1px solid #d1d5db;
    border-radius: 15px;
    padding: 0 13px;
    font-size: 14px;
    outline: none;
    background: #ffffff;
  }

  .field input:focus,
  .password-box input:focus {
    border-color: #c8102e;
    box-shadow: 0 0 0 3px rgba(200, 16, 46, 0.12);
  }

  .password-box {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
  }

  .password-box button {
    height: 50px;
    border: none;
    border-radius: 15px;
    background: #eeeeee;
    color: #111111;
    font-size: 12px;
    font-weight: 900;
    padding: 0 12px;
    cursor: pointer;
  }

  .primary-button {
    width: 100%;
    height: 52px;
    border: none;
    border-radius: 16px;
    background: #c8102e;
    color: #ffffff;
    font-size: 15px;
    font-weight: 900;
    cursor: pointer;
    box-shadow: 0 10px 22px rgba(200, 16, 46, 0.24);
    margin-top: 4px;
  }

  .primary-button:disabled,
  .link-button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .link-button {
    width: 100%;
    border: none;
    background: transparent;
    color: #c8102e;
    font-size: 13px;
    font-weight: 900;
    margin-top: 16px;
    cursor: pointer;
  }

  .error-message {
    background: #fee2e2;
    color: #991b1b;
    border-radius: 14px;
    padding: 14px;
    font-size: 14px;
    line-height: 1.4;
    margin-bottom: 16px;
  }

  .success-message {
    background: #dcfce7;
    color: #166534;
    border-radius: 14px;
    padding: 14px;
    font-size: 14px;
    line-height: 1.4;
    margin-bottom: 16px;
  }

  @media (min-width: 768px) {
    .shell {
      padding-top: 36px;
    }

    .hero h1 {
      font-size: 48px;
    }
  }
`;