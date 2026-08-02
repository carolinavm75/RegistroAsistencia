'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type RolUsuario = 'Administrador' | 'Coordinador' | 'Profesor';

type Usuario = {
  id: string;
  nombre: string;
  correo: string;
};

type Materia = {
  id: string;
  codigo: string;
  nombre: string;
  periodo_id: string;
  profesor_id: string;
  estado: boolean;
};

type Sesion = {
  materia_id: string;
  fecha: string;
  hora_inicio: string;
  estado: string;
  tolerancia_minutos: number;
};

function fechaLocalISO(fecha = new Date()) {
  const year = fecha.getFullYear();
  const month = String(fecha.getMonth() + 1).padStart(2, '0');
  const day = String(fecha.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function horaLocal() {
  const fecha = new Date();
  const horas = String(fecha.getHours()).padStart(2, '0');
  const minutos = String(fecha.getMinutes()).padStart(2, '0');

  return `${horas}:${minutos}`;
}

function formatearFecha(fecha: string) {
  if (!fecha) return '';

  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${fecha}T00:00:00`));
}

function mostrarHora(hora: string) {
  if (!hora) return '';
  return hora.slice(0, 5);
}

function claveMes(fecha: string) {
  if (!fecha) return 'Sin fecha';

  return new Intl.DateTimeFormat('es-CO', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${fecha}T00:00:00`));
}

export default function MateriaPage() {
  return (
    <Suspense fallback={<CargandoMateria />}>
      <MateriaContent />
    </Suspense>
  );
}

function CargandoMateria() {
  return (
    <main className="page">
      <section className="shell">
        <section className="loading-card">
          <div className="brand-mark">ECI</div>
          <h1>Materia</h1>
          <p>Cargando...</p>
        </section>
      </section>

      <style>{estilos}</style>
    </main>
  );
}

function MateriaContent() {
  const searchParams = useSearchParams();
  const materiaId = searchParams.get('codigo') || '';

  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [rol, setRol] = useState<RolUsuario>('Profesor');

  const [materia, setMateria] = useState<Materia | null>(null);
  const [sesiones, setSesiones] = useState<Sesion[]>([]);

  const [fechaSesion, setFechaSesion] = useState(fechaLocalISO());
  const [horaSesion, setHoraSesion] = useState(horaLocal());

  const [puedeGestionar, setPuedeGestionar] = useState(false);

  const [cargando, setCargando] = useState(true);
  const [creando, setCreando] = useState(false);

  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    cargarPagina();
  }, []);

  const sesionesPorMes = useMemo(() => {
    const grupos = new Map<string, Sesion[]>();

    sesiones.forEach((sesion) => {
      const mes = claveMes(sesion.fecha);

      if (!grupos.has(mes)) {
        grupos.set(mes, []);
      }

      grupos.get(mes)?.push(sesion);
    });

    return Array.from(grupos.entries());
  }, [sesiones]);

  async function cargarPagina() {
    setCargando(true);
    setError('');
    setMensaje('');

    if (!materiaId) {
      setError('No se recibió el código de la materia.');
      setCargando(false);
      return;
    }

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

    const { data: materiaData, error: materiaError } = await supabase
      .from('materias')
      .select('id, codigo, nombre, periodo_id, profesor_id, estado')
      .eq('id', materiaId)
      .eq('estado', true)
      .maybeSingle();

    if (materiaError) {
      setError(`No fue posible cargar la materia: ${materiaError.message}`);
      setCargando(false);
      return;
    }

    if (!materiaData) {
      setError('No tienes acceso a esta materia o la materia no existe.');
      setCargando(false);
      return;
    }

    setMateria(materiaData);

    const puedeAdministrarMateria =
      rolDetectado === 'Administrador' ||
      materiaData.profesor_id === usuarioData.id;

    setPuedeGestionar(puedeAdministrarMateria);

    await cargarSesiones(materiaData.id);

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

  async function cargarSesiones(idMateria: string) {
    const { data, error } = await supabase
      .from('sesiones')
      .select('materia_id, fecha, hora_inicio, estado, tolerancia_minutos')
      .eq('materia_id', idMateria)
      .neq('estado', 'Cancelada')
      .order('fecha', { ascending: false })
      .order('hora_inicio', { ascending: false });

    if (error) {
      setError(`No fue posible cargar sesiones: ${error.message}`);
      return;
    }

    setSesiones(data || []);
  }

  async function crearSesion(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError('');
    setMensaje('');

    if (!materia) {
      setError('No hay materia seleccionada.');
      return;
    }

    if (!puedeGestionar) {
      setError('No tienes permiso para crear sesiones en esta materia.');
      return;
    }

    if (!fechaSesion || !horaSesion) {
      setError('Selecciona fecha y hora de la sesión.');
      return;
    }

    setCreando(true);

    const { error } = await supabase.from('sesiones').insert({
      materia_id: materia.id,
      fecha: fechaSesion,
      hora_inicio: horaSesion,
      estado: 'Abierta',
      tolerancia_minutos: 10,
    });

    setCreando(false);

    if (error) {
      if (error.code === '23505') {
        setError('Ya existe una sesión para esa fecha y hora.');
      } else {
        setError(`No fue posible crear la sesión: ${error.message}`);
      }

      return;
    }

    setMensaje('Sesión creada correctamente.');
    await cargarSesiones(materia.id);
  }

  function abrirAsistencia(sesion: Sesion) {
    if (!puedeGestionar) {
      setError('No tienes permiso para registrar asistencia en esta materia.');
      return;
    }

    window.location.href = `/asistencia?materia=${encodeURIComponent(
      sesion.materia_id
    )}&fecha=${encodeURIComponent(sesion.fecha)}&hora=${encodeURIComponent(
      sesion.hora_inicio
    )}`;
  }

  function abrirReporteMateria() {
    if (!materia) return;

    window.location.href = `/reportes/materias?materia=${encodeURIComponent(
      materia.id
    )}`;
  }

  function volver() {
    window.location.href = '/inicio';
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
          <p className="overline">Materia</p>

          <h1>
            {cargando
              ? 'Cargando...'
              : materia
                ? materia.nombre
                : 'Materia no disponible'}
          </h1>

          {materia && (
            <p>
              {materia.codigo} · {materia.periodo_id}
            </p>
          )}
        </section>

        {error && <div className="error-message">{error}</div>}
        {mensaje && <div className="success-message">{mensaje}</div>}

        {materia && (
          <>
            {puedeGestionar && (
              <section className="content-card">
                <div className="section-header">
                  <p className="section-label">Nueva sesión</p>
                </div>

                <form className="form" onSubmit={crearSesion}>
                  <div className="two-grid">
                    <label className="field">
                      <span>Fecha</span>

                      <input
                        type="date"
                        value={fechaSesion}
                        onChange={(e) => setFechaSesion(e.target.value)}
                      />
                    </label>

                    <label className="field">
                      <span>Hora</span>

                      <input
                        type="time"
                        value={horaSesion}
                        onChange={(e) => setHoraSesion(e.target.value)}
                      />
                    </label>
                  </div>

                  <button
                    type="submit"
                    className="primary-button"
                    disabled={creando || cargando}
                  >
                    {creando ? 'Creando...' : 'Crear sesión'}
                  </button>
                </form>
              </section>
            )}

            {!puedeGestionar && (
              <section className="content-card info-card">
                <p className="section-label">Consulta</p>
                <h2>Modo coordinador</h2>
                <p>
                  Puedes consultar el reporte de esta materia, pero no registrar
                  asistencia ni crear sesiones.
                </p>
              </section>
            )}

            <section className="summary-grid">
              <article>
                <span>Sesiones</span>
                <strong>{sesiones.length}</strong>
              </article>

              <article>
                <span>Rol</span>
                <strong>{rol}</strong>
              </article>
            </section>

            <section className="content-card">
              <div className="section-header">
                <p className="section-label">Sesiones</p>

                <button className="report-button" onClick={abrirReporteMateria}>
                  Ver reporte
                </button>
              </div>

              {cargando && <p className="empty-text">Cargando sesiones...</p>}

              {!cargando && sesiones.length === 0 && (
                <p className="empty-text">No hay sesiones registradas.</p>
              )}

              <div className="sessions-list">
                {sesionesPorMes.map(([mes, sesionesMes]) => (
                  <section key={mes} className="month-group">
                    <p className="month-label">{mes}</p>

                    <div className="session-group">
                      {sesionesMes.map((sesion) => (
                        <article
                          key={`${sesion.fecha}-${sesion.hora_inicio}`}
                          className="session-row"
                        >
                          <div className="session-main">
                            <strong>{formatearFecha(sesion.fecha)}</strong>
                            <span>{mostrarHora(sesion.hora_inicio)}</span>
                          </div>

                          {puedeGestionar ? (
                            <button
                              className="open-button"
                              onClick={() => abrirAsistencia(sesion)}
                            >
                              Abrir
                            </button>
                          ) : (
                            <button
                              className="open-button secondary"
                              onClick={abrirReporteMateria}
                            >
                              Reporte
                            </button>
                          )}
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </section>
          </>
        )}

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

  .hero p:last-child {
    margin: 10px 0 0;
    color: #d1d5db;
    font-size: 13px;
    font-weight: 800;
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
    font-size: 36px;
    line-height: 1;
    font-weight: 900;
    letter-spacing: -0.8px;
  }

  .content-card {
    background: #ffffff;
    border-radius: 24px;
    padding: 18px;
    box-shadow: 0 12px 38px rgba(0, 0, 0, 0.08);
    margin-bottom: 18px;
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

  .info-card h2 {
    margin: 5px 0 8px;
    font-size: 20px;
    font-weight: 900;
  }

  .info-card p:last-child {
    margin: 0;
    color: #666666;
    font-size: 14px;
    line-height: 1.45;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
  }

  .section-label {
    margin: 0;
    color: #c8102e;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    font-size: 12px;
    font-weight: 900;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .two-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
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

  .field input {
    width: 100%;
    height: 48px;
    border: 1px solid #d1d5db;
    border-radius: 14px;
    padding: 0 12px;
    font-size: 14px;
    outline: none;
    background: #ffffff;
  }

  .field input:focus {
    border-color: #c8102e;
    box-shadow: 0 0 0 3px rgba(200, 16, 46, 0.12);
  }

  .primary-button {
    width: 100%;
    height: 50px;
    border: none;
    border-radius: 14px;
    background: #c8102e;
    color: #ffffff;
    font-size: 15px;
    font-weight: 900;
    cursor: pointer;
    box-shadow: 0 10px 22px rgba(200, 16, 46, 0.24);
  }

  .primary-button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 14px;
  }

  .summary-grid article {
    background: #ffffff;
    border-radius: 17px;
    padding: 14px 8px;
    text-align: center;
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.16);
    border-top: 5px solid #c8102e;
  }

  .summary-grid span {
    display: block;
    font-size: 10px;
    color: #666666;
    font-weight: 900;
    margin-bottom: 5px;
  }

  .summary-grid strong {
    display: block;
    font-size: 18px;
    line-height: 1;
    font-weight: 900;
  }

  .report-button {
    border: none;
    border-radius: 999px;
    background: #111111;
    color: #ffffff;
    font-size: 12px;
    font-weight: 900;
    padding: 9px 12px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .sessions-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .month-group {
    margin: 0;
  }

  .month-label {
    margin: 0 0 8px;
    color: #666666;
    font-size: 12px;
    font-weight: 900;
    text-transform: capitalize;
  }

  .session-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .session-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 10px;
    align-items: center;
    border: 1px solid #e5e7eb;
    border-radius: 15px;
    background: #fafafa;
    padding: 10px;
  }

  .session-main {
    min-width: 0;
  }

  .session-main strong {
    display: block;
    color: #111111;
    font-size: 14px;
    line-height: 1.2;
    font-weight: 900;
    text-transform: capitalize;
  }

  .session-main span {
    display: block;
    margin-top: 3px;
    color: #666666;
    font-size: 11px;
    font-weight: 800;
  }

  .open-button {
    min-width: 74px;
    min-height: 34px;
    border: none;
    border-radius: 999px;
    background: #111111;
    color: #ffffff;
    font-size: 11px;
    font-weight: 900;
    cursor: pointer;
    padding: 0 10px;
  }

  .open-button.secondary {
    background: #eeeeee;
    color: #111111;
  }

  .empty-text {
    margin: 12px 0 0;
    color: #666666;
    font-size: 14px;
    line-height: 1.45;
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

  .footer-note {
    color: #666666;
    text-align: center;
    font-size: 12px;
    line-height: 1.4;
    margin: 18px 0 0;
  }

  @media (max-width: 420px) {
    .two-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (min-width: 768px) {
    .shell {
      padding-top: 28px;
    }

    .hero h1 {
      font-size: 42px;
    }
  }
`;