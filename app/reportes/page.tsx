'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type RolUsuario = 'Administrador' | 'Coordinador' | 'Profesor';

type Usuario = {
  id: string;
  nombre: string;
  correo: string;
};

export default function ReportesPage() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [rol, setRol] = useState<RolUsuario>('Profesor');

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    cargarPagina();
  }, []);

  async function cargarPagina() {
    setCargando(true);
    setError('');

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError) {
      setError(`No fue posible validar la sesión: ${sessionError.message}`);
      setCargando(false);
      return;
    }

    const email = sessionData.session?.user.email;

    if (!email) {
      window.location.href = '/auth';
      return;
    }

    const correoNormalizado = email.trim().toLowerCase();

    const { data: usuarioData, error: usuarioError } = await supabase
      .from('profesores')
      .select('id, nombre, correo')
      .eq('correo', correoNormalizado)
      .eq('estado', true)
      .maybeSingle();

    if (usuarioError) {
      setError(`No fue posible consultar el usuario: ${usuarioError.message}`);
      setCargando(false);
      return;
    }

    if (!usuarioData) {
      await supabase.auth.signOut();
      window.location.href = '/auth';
      return;
    }

    setUsuario(usuarioData);

    const rolDetectado = await detectarRol(usuarioData.id);
    setRol(rolDetectado);

    if (rolDetectado === 'Profesor') {
      window.location.href = '/reportes/materias';
      return;
    }

    setCargando(false);
  }

  async function detectarRol(profesorId: string): Promise<RolUsuario> {
    const { data: administradorData } = await supabase
      .from('administradores')
      .select('profesor_id, estado')
      .eq('profesor_id', profesorId)
      .eq('estado', true)
      .maybeSingle();

    if (administradorData) {
      return 'Administrador';
    }

    const { data: coordinadorData } = await supabase
      .from('coordinadores')
      .select('profesor_id, estado')
      .eq('profesor_id', profesorId)
      .eq('estado', true)
      .maybeSingle();

    if (coordinadorData) {
      return 'Coordinador';
    }

    return 'Profesor';
  }

  function irA(ruta: string) {
    window.location.href = ruta;
  }

  function volver() {
    window.location.href = '/inicio';
  }

  if (cargando) {
    return (
      <main className="page">
        <section className="shell">
          <section className="loading-card">
            <div className="brand-mark">ECI</div>
            <h1>Reportes</h1>
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
        <header className="topbar">
          <button className="back-button" onClick={volver}>
            ←
          </button>

          <div className="brand">
            <div className="brand-mark">ECI</div>

            <div>
              <p className="brand-name">Asistencia de Estudiantes</p>
              <p className="brand-subtitle">Escuela Colombiana de Ingeniería</p>
            </div>
          </div>
        </header>

        <section className="hero">
          <p className="overline">Reportes</p>
          <h1>Reportes</h1>
          <p>{rol}</p>
        </section>

        {error && <div className="error-message">{error}</div>}

        <section className="reports-list">
          <button
            className="report-card"
            onClick={() => irA('/reportes/materias')}
          >
            <div className="report-icon">📊</div>

            <div className="report-copy">
              <span>Materia</span>
              <strong>Reporte por materia</strong>
            </div>

            <em>→</em>
          </button>

          <button
            className="report-card"
            onClick={() => irA('/reportes/estudiantes')}
          >
            <div className="report-icon">👤</div>

            <div className="report-copy">
              <span>Estudiante</span>
              <strong>Reporte por estudiante</strong>
            </div>

            <em>→</em>
          </button>

          <button
            className="report-card"
            onClick={() => irA('/reportes/alertas')}
          >
            <div className="report-icon">⚠️</div>

            <div className="report-copy">
              <span>Alertas</span>
              <strong>Alertas de asistencia</strong>
            </div>

            <em>→</em>
          </button>
        </section>

        {usuario && <p className="footer-note">{usuario.nombre}</p>}
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
      linear-gradient(180deg, #111111 0%, #111111 30%, #f4f4f4 30%, #f4f4f4 100%);
    color: #111111;
  }

  .shell {
    width: 100%;
    max-width: 540px;
    min-height: 100vh;
    margin: 0 auto;
    padding: 18px 16px 28px;
  }

  .topbar {
    display: flex;
    align-items: center;
    gap: 12px;
    color: #ffffff;
    padding: 6px 0 22px;
  }

  .back-button {
    width: 42px;
    height: 42px;
    border: none;
    border-radius: 14px;
    background: #ffffff;
    color: #111111;
    font-size: 22px;
    font-weight: 900;
    cursor: pointer;
    flex-shrink: 0;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .brand-mark {
    width: 46px;
    height: 46px;
    border-radius: 14px;
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
    font-size: 13px;
    font-weight: 900;
    line-height: 1.15;
  }

  .brand-subtitle {
    margin: 3px 0 0;
    font-size: 11px;
    color: #d1d5db;
  }

  .hero {
    color: #ffffff;
    padding: 8px 0 26px;
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
    font-size: 38px;
    line-height: 1;
    font-weight: 900;
    letter-spacing: -0.8px;
  }

  .hero p:last-child {
    margin: 10px 0 0;
    color: #d1d5db;
    font-size: 13px;
    font-weight: 800;
  }

  .loading-card {
    margin-top: 120px;
    background: #ffffff;
    border-radius: 26px;
    padding: 22px;
    text-align: center;
    box-shadow: 0 20px 55px rgba(0, 0, 0, 0.18);
    border-top: 7px solid #c8102e;
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

  .reports-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .report-card {
    width: 100%;
    border: none;
    border-radius: 24px;
    background: #ffffff;
    color: #111111;
    padding: 18px;
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 14px;
    align-items: center;
    text-align: left;
    cursor: pointer;
    box-shadow: 0 12px 38px rgba(0, 0, 0, 0.08);
    border-left: 6px solid #c8102e;
  }

  .report-icon {
    width: 54px;
    height: 54px;
    border-radius: 18px;
    background: #f4f4f4;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 27px;
    flex-shrink: 0;
  }

  .report-copy {
    min-width: 0;
  }

  .report-copy span {
    display: block;
    color: #c8102e;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    font-size: 11px;
    font-weight: 900;
    margin-bottom: 5px;
  }

  .report-copy strong {
    display: block;
    font-size: 19px;
    line-height: 1.15;
    font-weight: 900;
  }

  .report-card em {
    width: 38px;
    height: 38px;
    border-radius: 14px;
    background: #111111;
    color: #ffffff;
    font-style: normal;
    font-size: 20px;
    font-weight: 900;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
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

  .footer-note {
    color: #666666;
    text-align: center;
    font-size: 12px;
    line-height: 1.4;
    margin: 18px 0 0;
  }

  @media (max-width: 390px) {
    .report-card {
      gap: 10px;
      padding: 16px;
    }

    .report-icon {
      width: 48px;
      height: 48px;
      font-size: 24px;
    }

    .report-copy strong {
      font-size: 17px;
    }

    .report-card em {
      width: 34px;
      height: 34px;
    }
  }

  @media (min-width: 768px) {
    .shell {
      padding-top: 28px;
    }

    .hero h1 {
      font-size: 44px;
    }
  }
`;