'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Usuario = {
  id: string;
  nombre: string;
  correo: string;
};

type Alumno = {
  id: string;
  nombre: string;
  correo: string | null;
  codigo_qr: string;
  estado: boolean;
};

function normalizarTexto(texto: string | null | undefined) {
  return String(texto || '').trim().toLowerCase();
}

export default function GestionAlumnosPage() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);

  const [alumnos, setAlumnos] = useState<Alumno[]>([]);

  const [editandoId, setEditandoId] = useState('');

  const [id, setId] = useState('');
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [codigoQr, setCodigoQr] = useState('');

  const [busqueda, setBusqueda] = useState('');
  const [verSoloActivos, setVerSoloActivos] = useState(true);

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    cargarPagina();
  }, []);

  const alumnosFiltrados = useMemo(() => {
    const texto = normalizarTexto(busqueda);

    return alumnos
      .filter((alumno) => {
        if (verSoloActivos) return alumno.estado;
        return true;
      })
      .filter((alumno) => {
        if (!texto) return true;

        return (
          normalizarTexto(alumno.id).includes(texto) ||
          normalizarTexto(alumno.nombre).includes(texto) ||
          normalizarTexto(alumno.correo).includes(texto) ||
          normalizarTexto(alumno.codigo_qr).includes(texto)
        );
      })
      .sort((a, b) => {
        if (a.estado !== b.estado) return a.estado ? -1 : 1;
        return a.nombre.localeCompare(b.nombre);
      });
  }, [alumnos, busqueda, verSoloActivos]);

  const totalActivos = alumnos.filter((alumno) => alumno.estado).length;
  const totalInactivos = alumnos.filter((alumno) => !alumno.estado).length;

  async function cargarPagina() {
    setCargando(true);
    setError('');
    setMensaje('');

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

    const { data: administradorData, error: administradorError } = await supabase
      .from('administradores')
      .select('profesor_id, estado')
      .eq('profesor_id', usuarioData.id)
      .eq('estado', true)
      .maybeSingle();

    if (administradorError) {
      setError(
        `No fue posible consultar permisos de administración: ${administradorError.message}`
      );
      setCargando(false);
      return;
    }

    if (!administradorData) {
      setError('No tienes permisos de administración para acceder a esta sección.');
      setCargando(false);
      return;
    }

    await cargarAlumnos();

    setCargando(false);
  }

  async function cargarAlumnos() {
    setError('');

    const { data, error } = await supabase
      .from('alumnos')
      .select('id, nombre, correo, codigo_qr, estado')
      .order('nombre', { ascending: true });

    if (error) {
      setError(`No fue posible cargar estudiantes: ${error.message}`);
      return;
    }

    setAlumnos(data || []);
  }

  async function guardarAlumno(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError('');
    setMensaje('');

    const idLimpio = id.trim();
    const nombreLimpio = nombre.trim();
    const correoLimpio = correo.trim().toLowerCase();
    const codigoQrLimpio = codigoQr.trim();

    if (!idLimpio) {
      setError('Escribe el código institucional del estudiante.');
      return;
    }

    if (!nombreLimpio) {
      setError('Escribe el nombre del estudiante.');
      return;
    }

    if (!codigoQrLimpio) {
      setError('Escribe el código QR del estudiante.');
      return;
    }

    setGuardando(true);

    if (editandoId) {
      const { error } = await supabase
        .from('alumnos')
        .update({
          nombre: nombreLimpio,
          correo: correoLimpio || null,
          codigo_qr: codigoQrLimpio,
        })
        .eq('id', editandoId);

      setGuardando(false);

      if (error) {
        if (error.code === '23505') {
          setError('Ya existe otro estudiante con ese correo o código QR.');
        } else {
          setError(`No fue posible actualizar el estudiante: ${error.message}`);
        }

        return;
      }

      setMensaje('Estudiante actualizado correctamente.');
      limpiarFormulario();
      await cargarAlumnos();
      return;
    }

    const { error } = await supabase.from('alumnos').insert({
      id: idLimpio,
      nombre: nombreLimpio,
      correo: correoLimpio || null,
      codigo_qr: codigoQrLimpio,
      estado: true,
    });

    setGuardando(false);

    if (error) {
      if (error.code === '23505') {
        setError('Ya existe un estudiante con ese código, correo o código QR.');
      } else {
        setError(`No fue posible crear el estudiante: ${error.message}`);
      }

      return;
    }

    setMensaje('Estudiante creado correctamente.');
    limpiarFormulario();
    await cargarAlumnos();
  }

  function editarAlumno(alumno: Alumno) {
    setEditandoId(alumno.id);
    setId(alumno.id);
    setNombre(alumno.nombre);
    setCorreo(alumno.correo || '');
    setCodigoQr(alumno.codigo_qr);
    setMensaje('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function cambiarEstadoAlumno(alumno: Alumno) {
    setError('');
    setMensaje('');

    const nuevoEstado = !alumno.estado;

    const { error } = await supabase
      .from('alumnos')
      .update({ estado: nuevoEstado })
      .eq('id', alumno.id);

    if (error) {
      setError(`No fue posible actualizar el estudiante: ${error.message}`);
      return;
    }

    setMensaje(
      nuevoEstado
        ? 'Estudiante activado correctamente.'
        : 'Estudiante inactivado correctamente.'
    );

    await cargarAlumnos();
  }

  function usarCodigoComoQR() {
    const idLimpio = id.trim();

    if (!idLimpio) {
      setError('Primero escribe el código institucional del estudiante.');
      return;
    }

    setCodigoQr(idLimpio);
    setError('');
  }

  function limpiarFormulario() {
    setEditandoId('');
    setId('');
    setNombre('');
    setCorreo('');
    setCodigoQr('');
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
          <p className="overline">Administración</p>
          <h1>Estudiantes</h1>
        </section>

        {error && <div className="error-message">{error}</div>}
        {mensaje && <div className="success-message">{mensaje}</div>}

        <section className="content-card">
          <div className="section-header">
            <p className="section-label">
              {editandoId ? 'Editar estudiante' : 'Nuevo estudiante'}
            </p>

            {editandoId && (
              <button className="refresh-button" onClick={limpiarFormulario}>
                Cancelar
              </button>
            )}
          </div>

          <form className="form" onSubmit={guardarAlumno}>
            <label className="field">
              <span>Código institucional</span>

              <input
                type="text"
                value={id}
                placeholder="Ej. 2200000"
                onChange={(e) => setId(e.target.value)}
                disabled={Boolean(editandoId)}
              />
            </label>

            <label className="field">
              <span>Nombre</span>

              <input
                type="text"
                value={nombre}
                placeholder="Nombre completo"
                onChange={(e) => setNombre(e.target.value)}
              />
            </label>

            <label className="field">
              <span>Correo</span>

              <input
                type="email"
                value={correo}
                placeholder="correo@escuelaing.edu.co"
                onChange={(e) => setCorreo(e.target.value)}
              />
            </label>

            <div className="qr-row">
              <label className="field">
                <span>Código QR</span>

                <input
                  type="text"
                  value={codigoQr}
                  placeholder="Código para escanear"
                  onChange={(e) => setCodigoQr(e.target.value)}
                />
              </label>

              <button
                type="button"
                className="qr-button"
                onClick={usarCodigoComoQR}
              >
                Usar código
              </button>
            </div>

            <button
              type="submit"
              className="primary-button"
              disabled={guardando || cargando}
            >
              {guardando
                ? 'Guardando...'
                : editandoId
                  ? 'Guardar cambios'
                  : 'Crear estudiante'}
            </button>
          </form>
        </section>

        <section className="summary-grid">
          <article>
            <span>Activos</span>
            <strong>{totalActivos}</strong>
          </article>

          <article>
            <span>Inactivos</span>
            <strong>{totalInactivos}</strong>
          </article>
        </section>

        <section className="content-card">
          <div className="section-header">
            <p className="section-label">Listado</p>

            <button
              className={verSoloActivos ? 'toggle-button active' : 'toggle-button'}
              onClick={() => setVerSoloActivos(!verSoloActivos)}
            >
              {verSoloActivos ? 'Activos' : 'Todos'}
            </button>
          </div>

          <input
            className="search-input"
            type="text"
            value={busqueda}
            placeholder="Buscar estudiante"
            onChange={(e) => setBusqueda(e.target.value)}
          />

          {cargando && <p className="empty-text">Cargando estudiantes...</p>}

          {!cargando && alumnosFiltrados.length === 0 && (
            <p className="empty-text">No hay estudiantes para mostrar.</p>
          )}

          <div className="compact-list">
            {alumnosFiltrados.map((alumno) => (
              <article key={alumno.id} className="compact-row">
                <div className="student-main">
                  <strong>{alumno.nombre}</strong>

                  <span>
                    {alumno.id}
                    {alumno.correo ? ` · ${alumno.correo}` : ''}
                  </span>

                  <small>QR: {alumno.codigo_qr}</small>
                </div>

                <span className={alumno.estado ? 'status active' : 'status inactive'}>
                  {alumno.estado ? 'Activo' : 'Inactivo'}
                </span>

                <div className="actions">
                  <button
                    className="edit-button"
                    onClick={() => editarAlumno(alumno)}
                  >
                    Editar
                  </button>

                  <button
                    className={alumno.estado ? 'danger-button' : 'activate-button'}
                    onClick={() => cambiarEstadoAlumno(alumno)}
                  >
                    {alumno.estado ? 'Inactivar' : 'Activar'}
                  </button>
                </div>
              </article>
            ))}
          </div>
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

  .content-card {
    background: #ffffff;
    border-radius: 24px;
    padding: 18px;
    box-shadow: 0 12px 38px rgba(0, 0, 0, 0.08);
    margin-bottom: 18px;
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
  .search-input {
    width: 100%;
    height: 48px;
    border: 1px solid #d1d5db;
    border-radius: 14px;
    padding: 0 12px;
    font-size: 14px;
    outline: none;
    background: #ffffff;
  }

  .field input:disabled {
    background: #f4f4f4;
    color: #666666;
  }

  .field input:focus,
  .search-input:focus {
    border-color: #c8102e;
    box-shadow: 0 0 0 3px rgba(200, 16, 46, 0.12);
  }

  .qr-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 10px;
    align-items: end;
  }

  .qr-button {
    height: 48px;
    border: none;
    border-radius: 14px;
    background: #111111;
    color: #ffffff;
    font-size: 12px;
    font-weight: 900;
    cursor: pointer;
    padding: 0 12px;
    white-space: nowrap;
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

  .refresh-button,
  .toggle-button {
    border: none;
    border-radius: 999px;
    background: #eeeeee;
    color: #111111;
    font-size: 12px;
    font-weight: 900;
    padding: 9px 12px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .toggle-button.active {
    background: #111111;
    color: #ffffff;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
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
    font-size: 22px;
    line-height: 1;
    font-weight: 900;
  }

  .compact-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 12px;
  }

  .compact-row {
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    background: #fafafa;
    padding: 12px;
  }

  .student-main {
    margin-bottom: 10px;
  }

  .student-main strong {
    display: block;
    color: #111111;
    font-size: 15px;
    font-weight: 900;
    line-height: 1.25;
  }

  .student-main span,
  .student-main small {
    display: block;
    margin-top: 3px;
    color: #666666;
    font-size: 11px;
    font-weight: 800;
    line-height: 1.35;
    word-break: break-word;
  }

  .status {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    padding: 6px 8px;
    font-size: 10px;
    font-weight: 900;
    white-space: nowrap;
    margin-bottom: 10px;
  }

  .status.active {
    background: #dcfce7;
    color: #166534;
  }

  .status.inactive {
    background: #fee2e2;
    color: #991b1b;
  }

  .actions {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 7px;
  }

  .actions button {
    min-height: 36px;
    border: none;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 900;
    cursor: pointer;
    padding: 0 8px;
  }

  .edit-button {
    background: #eeeeee;
    color: #111111;
  }

  .danger-button {
    background: #fee2e2;
    color: #991b1b;
  }

  .activate-button {
    background: #dcfce7;
    color: #166534;
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
    .qr-row {
      grid-template-columns: 1fr;
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