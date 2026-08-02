'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Usuario = {
  id: string;
  nombre: string;
  correo: string;
};

type Profesor = {
  id: string;
  nombre: string;
  correo: string;
  estado: boolean;
};

type RolAsignado = {
  profesor_id: string;
  estado: boolean;
};

type ProfesorVista = Profesor & {
  esCoordinador: boolean;
  esAdministrador: boolean;
};

function normalizarTexto(texto: string | null | undefined) {
  return String(texto || '').trim().toLowerCase();
}

export default function GestionProfesoresPage() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);

  const [profesores, setProfesores] = useState<Profesor[]>([]);
  const [coordinadores, setCoordinadores] = useState<RolAsignado[]>([]);
  const [administradores, setAdministradores] = useState<RolAsignado[]>([]);

  const [editandoId, setEditandoId] = useState('');

  const [id, setId] = useState('');
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');

  const [busqueda, setBusqueda] = useState('');
  const [verSoloActivos, setVerSoloActivos] = useState(true);

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    cargarPagina();
  }, []);

  const coordinadoresActivos = useMemo(() => {
    return new Set(
      coordinadores
        .filter((coordinador) => coordinador.estado)
        .map((coordinador) => coordinador.profesor_id)
    );
  }, [coordinadores]);

  const administradoresActivos = useMemo(() => {
    return new Set(
      administradores
        .filter((administrador) => administrador.estado)
        .map((administrador) => administrador.profesor_id)
    );
  }, [administradores]);

  const profesoresVista = useMemo<ProfesorVista[]>(() => {
    return profesores
      .map((profesor) => ({
        ...profesor,
        esCoordinador: coordinadoresActivos.has(profesor.id),
        esAdministrador: administradoresActivos.has(profesor.id),
      }))
      .sort((a, b) => {
        if (a.estado !== b.estado) return a.estado ? -1 : 1;
        return a.nombre.localeCompare(b.nombre);
      });
  }, [profesores, coordinadoresActivos, administradoresActivos]);

  const profesoresFiltrados = useMemo(() => {
    const texto = normalizarTexto(busqueda);

    return profesoresVista
      .filter((profesor) => {
        if (verSoloActivos) return profesor.estado;
        return true;
      })
      .filter((profesor) => {
        if (!texto) return true;

        return (
          normalizarTexto(profesor.id).includes(texto) ||
          normalizarTexto(profesor.nombre).includes(texto) ||
          normalizarTexto(profesor.correo).includes(texto)
        );
      });
  }, [profesoresVista, busqueda, verSoloActivos]);

  const totalActivos = profesores.filter((profesor) => profesor.estado).length;
  const totalInactivos = profesores.filter((profesor) => !profesor.estado).length;
  const totalCoordinadores = coordinadores.filter((item) => item.estado).length;
  const totalAdministradores = administradores.filter((item) => item.estado).length;

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

    await cargarDatos();

    setCargando(false);
  }

  async function cargarDatos() {
    setError('');

    const { data: profesoresData, error: profesoresError } = await supabase
      .from('profesores')
      .select('id, nombre, correo, estado')
      .order('nombre', { ascending: true });

    if (profesoresError) {
      setError(`No fue posible cargar profesores: ${profesoresError.message}`);
      return;
    }

    const { data: coordinadoresData, error: coordinadoresError } = await supabase
      .from('coordinadores')
      .select('profesor_id, estado');

    if (coordinadoresError) {
      setError(`No fue posible cargar coordinadores: ${coordinadoresError.message}`);
      return;
    }

    const { data: administradoresData, error: administradoresError } =
      await supabase.from('administradores').select('profesor_id, estado');

    if (administradoresError) {
      setError(
        `No fue posible cargar administradores: ${administradoresError.message}`
      );
      return;
    }

    setProfesores(profesoresData || []);
    setCoordinadores(coordinadoresData || []);
    setAdministradores(administradoresData || []);
  }

  async function guardarProfesor(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError('');
    setMensaje('');

    const idLimpio = id.trim();
    const nombreLimpio = nombre.trim();
    const correoLimpio = correo.trim().toLowerCase();

    if (!idLimpio) {
      setError('Escribe el código institucional del profesor.');
      return;
    }

    if (!nombreLimpio) {
      setError('Escribe el nombre del profesor.');
      return;
    }

    if (!correoLimpio) {
      setError('Escribe el correo del profesor.');
      return;
    }

    setGuardando(true);

    if (editandoId) {
      const { error } = await supabase
        .from('profesores')
        .update({
          nombre: nombreLimpio,
          correo: correoLimpio,
        })
        .eq('id', editandoId);

      setGuardando(false);

      if (error) {
        if (error.code === '23505') {
          setError('Ya existe otro profesor con ese correo.');
        } else {
          setError(`No fue posible actualizar el profesor: ${error.message}`);
        }

        return;
      }

      setMensaje('Profesor actualizado correctamente.');
      limpiarFormulario();
      await cargarDatos();
      return;
    }

    const { error } = await supabase.from('profesores').insert({
      id: idLimpio,
      nombre: nombreLimpio,
      correo: correoLimpio,
      estado: true,
    });

    setGuardando(false);

    if (error) {
      if (error.code === '23505') {
        setError('Ya existe un profesor con ese código o correo.');
      } else {
        setError(`No fue posible crear el profesor: ${error.message}`);
      }

      return;
    }

    setMensaje('Profesor creado correctamente. Ahora puede registrarse en /auth.');
    limpiarFormulario();
    await cargarDatos();
  }

  function editarProfesor(profesor: ProfesorVista) {
    setEditandoId(profesor.id);
    setId(profesor.id);
    setNombre(profesor.nombre);
    setCorreo(profesor.correo);
    setError('');
    setMensaje('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function cambiarEstadoProfesor(profesor: ProfesorVista) {
    setError('');
    setMensaje('');

    if (usuario?.id === profesor.id && profesor.estado) {
      setError('No puedes inactivar tu propio usuario administrador.');
      return;
    }

    const nuevoEstado = !profesor.estado;

    const { error } = await supabase
      .from('profesores')
      .update({ estado: nuevoEstado })
      .eq('id', profesor.id);

    if (error) {
      setError(`No fue posible actualizar el profesor: ${error.message}`);
      return;
    }

    setMensaje(
      nuevoEstado
        ? 'Profesor activado correctamente.'
        : 'Profesor inactivado correctamente.'
    );

    await cargarDatos();
  }

  async function cambiarRolCoordinador(profesor: ProfesorVista) {
    setError('');
    setMensaje('');

    if (!profesor.estado && !profesor.esCoordinador) {
      setError('No puedes asignar como coordinador a un profesor inactivo.');
      return;
    }

    const nuevoEstado = !profesor.esCoordinador;

    const { error } = await supabase.from('coordinadores').upsert(
      {
        profesor_id: profesor.id,
        estado: nuevoEstado,
      },
      {
        onConflict: 'profesor_id',
      }
    );

    if (error) {
      setError(`No fue posible actualizar el rol de coordinador: ${error.message}`);
      return;
    }

    setMensaje(
      nuevoEstado
        ? 'Profesor marcado como coordinador.'
        : 'Rol de coordinador retirado.'
    );

    await cargarDatos();
  }

  async function cambiarRolAdministrador(profesor: ProfesorVista) {
    setError('');
    setMensaje('');

    if (usuario?.id === profesor.id && profesor.esAdministrador) {
      setError('No puedes quitarte tu propio rol de administrador.');
      return;
    }

    if (!profesor.estado && !profesor.esAdministrador) {
      setError('No puedes asignar como administrador a un profesor inactivo.');
      return;
    }

    const nuevoEstado = !profesor.esAdministrador;

    const { error } = await supabase.from('administradores').upsert(
      {
        profesor_id: profesor.id,
        estado: nuevoEstado,
      },
      {
        onConflict: 'profesor_id',
      }
    );

    if (error) {
      setError(`No fue posible actualizar el rol de administrador: ${error.message}`);
      return;
    }

    setMensaje(
      nuevoEstado
        ? 'Profesor marcado como administrador.'
        : 'Rol de administrador retirado.'
    );

    await cargarDatos();
  }

  function limpiarFormulario() {
    setEditandoId('');
    setId('');
    setNombre('');
    setCorreo('');
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
          <h1>Profesores</h1>
        </section>

        {error && <div className="error-message">{error}</div>}
        {mensaje && <div className="success-message">{mensaje}</div>}

        <section className="content-card">
          <div className="section-header">
            <p className="section-label">
              {editandoId ? 'Editar profesor' : 'Nuevo profesor'}
            </p>

            {editandoId && (
              <button className="refresh-button" onClick={limpiarFormulario}>
                Cancelar
              </button>
            )}
          </div>

          <form className="form" onSubmit={guardarProfesor}>
            <label className="field">
              <span>Código institucional</span>

              <input
                type="text"
                value={id}
                placeholder="Ej. 1000000453"
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

            <button
              type="submit"
              className="primary-button"
              disabled={guardando || cargando}
            >
              {guardando
                ? 'Guardando...'
                : editandoId
                  ? 'Guardar cambios'
                  : 'Crear profesor'}
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

          <article>
            <span>Coord.</span>
            <strong>{totalCoordinadores}</strong>
          </article>

          <article>
            <span>Admin</span>
            <strong>{totalAdministradores}</strong>
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
            placeholder="Buscar profesor"
            onChange={(e) => setBusqueda(e.target.value)}
          />

          {cargando && <p className="empty-text">Cargando profesores...</p>}

          {!cargando && profesoresFiltrados.length === 0 && (
            <p className="empty-text">No hay profesores para mostrar.</p>
          )}

          <div className="compact-list">
            {profesoresFiltrados.map((profesor) => (
              <article key={profesor.id} className="compact-row">
                <div className="teacher-main">
                  <strong>{profesor.nombre}</strong>

                  <span>
                    {profesor.id} · {profesor.correo}
                  </span>
                </div>

                <div className="badge-row">
                  <span
                    className={profesor.estado ? 'status active' : 'status inactive'}
                  >
                    {profesor.estado ? 'Activo' : 'Inactivo'}
                  </span>

                  {profesor.esCoordinador && (
                    <span className="status coordinator">Coordinador</span>
                  )}

                  {profesor.esAdministrador && (
                    <span className="status admin">Admin</span>
                  )}
                </div>

                <div className="actions">
                  <button
                    className="edit-button"
                    onClick={() => editarProfesor(profesor)}
                  >
                    Editar
                  </button>

                  <button
                    className={profesor.estado ? 'danger-button' : 'activate-button'}
                    onClick={() => cambiarEstadoProfesor(profesor)}
                  >
                    {profesor.estado ? 'Inactivar' : 'Activar'}
                  </button>

                  <button
                    className={
                      profesor.esCoordinador ? 'role-button active' : 'role-button'
                    }
                    onClick={() => cambiarRolCoordinador(profesor)}
                  >
                    {profesor.esCoordinador ? 'Quitar coord.' : 'Coord.'}
                  </button>

                  <button
                    className={
                      profesor.esAdministrador ? 'role-button active' : 'role-button'
                    }
                    onClick={() => cambiarRolAdministrador(profesor)}
                  >
                    {profesor.esAdministrador ? 'Quitar admin' : 'Admin'}
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
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-bottom: 14px;
  }

  .summary-grid article {
    background: #ffffff;
    border-radius: 17px;
    padding: 12px 6px;
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
    font-size: 20px;
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

  .teacher-main {
    margin-bottom: 10px;
  }

  .teacher-main strong {
    display: block;
    color: #111111;
    font-size: 15px;
    font-weight: 900;
    line-height: 1.25;
  }

  .teacher-main span {
    display: block;
    margin-top: 3px;
    color: #666666;
    font-size: 11px;
    font-weight: 800;
    line-height: 1.35;
    word-break: break-word;
  }

  .badge-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 10px;
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
  }

  .status.active {
    background: #dcfce7;
    color: #166534;
  }

  .status.inactive {
    background: #fee2e2;
    color: #991b1b;
  }

  .status.coordinator {
    background: #dbeafe;
    color: #1e40af;
  }

  .status.admin {
    background: #111111;
    color: #ffffff;
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

  .role-button {
    background: #eeeeee;
    color: #111111;
  }

  .role-button.active {
    background: #111111;
    color: #ffffff;
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
    .summary-grid {
      grid-template-columns: repeat(2, 1fr);
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