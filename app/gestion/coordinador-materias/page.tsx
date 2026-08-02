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

type Materia = {
  id: string;
  codigo: string;
  nombre: string;
  periodo_id: string;
  profesor_id: string;
  estado: boolean;
};

type CoordinadorRol = {
  profesor_id: string;
  estado: boolean;
};

type Asignacion = {
  coordinador_id: string;
  materia_id: string;
  estado: boolean;
};

type AsignacionVista = Asignacion & {
  coordinador_nombre: string;
  coordinador_correo: string;
  materia_nombre: string;
  materia_codigo: string;
  materia_periodo: string;
};

function normalizarTexto(texto: string | null | undefined) {
  return String(texto || '').trim().toLowerCase();
}

export default function GestionCoordinadorMateriasPage() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);

  const [profesores, setProfesores] = useState<Profesor[]>([]);
  const [coordinadoresRol, setCoordinadoresRol] = useState<CoordinadorRol[]>([]);
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);

  const [coordinadorId, setCoordinadorId] = useState('');
  const [materiaId, setMateriaId] = useState('');

  const [busqueda, setBusqueda] = useState('');
  const [verSoloActivas, setVerSoloActivas] = useState(true);

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    cargarPagina();
  }, []);

  const profesoresPorId = useMemo(() => {
    const mapa = new Map<string, Profesor>();

    profesores.forEach((profesor) => {
      mapa.set(profesor.id, profesor);
    });

    return mapa;
  }, [profesores]);

  const materiasPorId = useMemo(() => {
    const mapa = new Map<string, Materia>();

    materias.forEach((materia) => {
      mapa.set(materia.id, materia);
    });

    return mapa;
  }, [materias]);

  const coordinadoresActivos = useMemo(() => {
    return coordinadoresRol
      .filter((coordinador) => coordinador.estado)
      .map((coordinador) => profesoresPorId.get(coordinador.profesor_id))
      .filter(Boolean) as Profesor[];
  }, [coordinadoresRol, profesoresPorId]);

  const asignacionesVista = useMemo<AsignacionVista[]>(() => {
    return asignaciones
      .map((asignacion) => {
        const coordinador = profesoresPorId.get(asignacion.coordinador_id);
        const materia = materiasPorId.get(asignacion.materia_id);

        return {
          ...asignacion,
          coordinador_nombre: coordinador?.nombre || 'Coordinador no encontrado',
          coordinador_correo: coordinador?.correo || '',
          materia_nombre: materia?.nombre || 'Materia no encontrada',
          materia_codigo: materia?.codigo || '',
          materia_periodo: materia?.periodo_id || '',
        };
      })
      .sort((a, b) => {
        if (a.estado !== b.estado) return a.estado ? -1 : 1;

        return (
          a.coordinador_nombre.localeCompare(b.coordinador_nombre) ||
          a.materia_nombre.localeCompare(b.materia_nombre)
        );
      });
  }, [asignaciones, profesoresPorId, materiasPorId]);

  const asignacionesFiltradas = useMemo(() => {
    const texto = normalizarTexto(busqueda);

    return asignacionesVista
      .filter((asignacion) => {
        if (verSoloActivas) return asignacion.estado;
        return true;
      })
      .filter((asignacion) => {
        if (!texto) return true;

        return (
          normalizarTexto(asignacion.coordinador_nombre).includes(texto) ||
          normalizarTexto(asignacion.coordinador_correo).includes(texto) ||
          normalizarTexto(asignacion.materia_nombre).includes(texto) ||
          normalizarTexto(asignacion.materia_codigo).includes(texto) ||
          normalizarTexto(asignacion.materia_periodo).includes(texto)
        );
      });
  }, [asignacionesVista, busqueda, verSoloActivas]);

  const totalActivas = asignaciones.filter((asignacion) => asignacion.estado).length;
  const totalInactivas = asignaciones.filter(
    (asignacion) => !asignacion.estado
  ).length;

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
      .eq('estado', true)
      .order('nombre', { ascending: true });

    if (profesoresError) {
      setError(`No fue posible cargar profesores: ${profesoresError.message}`);
      return;
    }

    const { data: coordinadoresData, error: coordinadoresError } = await supabase
      .from('coordinadores')
      .select('profesor_id, estado')
      .eq('estado', true);

    if (coordinadoresError) {
      setError(`No fue posible cargar coordinadores: ${coordinadoresError.message}`);
      return;
    }

    const { data: materiasData, error: materiasError } = await supabase
      .from('materias')
      .select('id, codigo, nombre, periodo_id, profesor_id, estado')
      .eq('estado', true)
      .order('periodo_id', { ascending: false })
      .order('nombre', { ascending: true });

    if (materiasError) {
      setError(`No fue posible cargar materias: ${materiasError.message}`);
      return;
    }

    const { data: asignacionesData, error: asignacionesError } = await supabase
      .from('coordinador_materias')
      .select('coordinador_id, materia_id, estado');

    if (asignacionesError) {
      setError(`No fue posible cargar asignaciones: ${asignacionesError.message}`);
      return;
    }

    const profesoresActivos = profesoresData || [];
    const coordinadoresActivosData = coordinadoresData || [];
    const materiasActivas = materiasData || [];

    setProfesores(profesoresActivos);
    setCoordinadoresRol(coordinadoresActivosData);
    setMaterias(materiasActivas);
    setAsignaciones(asignacionesData || []);

    const primerCoordinadorId = coordinadoresActivosData[0]?.profesor_id || '';
    const primeraMateriaId = materiasActivas[0]?.id || '';

    if (!coordinadorId && primerCoordinadorId) {
      setCoordinadorId(primerCoordinadorId);
    }

    if (!materiaId && primeraMateriaId) {
      setMateriaId(primeraMateriaId);
    }
  }

  async function guardarAsignacion(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError('');
    setMensaje('');

    if (!coordinadorId) {
      setError('Selecciona un coordinador.');
      return;
    }

    if (!materiaId) {
      setError('Selecciona una materia.');
      return;
    }

    setGuardando(true);

    const { error } = await supabase.from('coordinador_materias').upsert(
      {
        coordinador_id: coordinadorId,
        materia_id: materiaId,
        estado: true,
      },
      {
        onConflict: 'coordinador_id,materia_id',
      }
    );

    setGuardando(false);

    if (error) {
      setError(`No fue posible asignar la materia: ${error.message}`);
      return;
    }

    setMensaje('Materia asignada correctamente.');
    await cargarDatos();
  }

  async function cambiarEstadoAsignacion(asignacion: AsignacionVista) {
    setError('');
    setMensaje('');

    const nuevoEstado = !asignacion.estado;

    const { error } = await supabase
      .from('coordinador_materias')
      .update({ estado: nuevoEstado })
      .eq('coordinador_id', asignacion.coordinador_id)
      .eq('materia_id', asignacion.materia_id);

    if (error) {
      setError(`No fue posible actualizar la asignación: ${error.message}`);
      return;
    }

    setMensaje(
      nuevoEstado
        ? 'Asignación activada correctamente.'
        : 'Asignación inactivada correctamente.'
    );

    await cargarDatos();
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
          <h1>Coord. materias</h1>
        </section>

        {error && <div className="error-message">{error}</div>}
        {mensaje && <div className="success-message">{mensaje}</div>}

        <section className="content-card">
          <div className="section-header">
            <p className="section-label">Nueva asignación</p>

            <button
              className="refresh-button"
              onClick={cargarDatos}
              disabled={guardando || cargando}
            >
              Actualizar
            </button>
          </div>

          <form className="form" onSubmit={guardarAsignacion}>
            <label className="field">
              <span>Coordinador</span>

              <select
                value={coordinadorId}
                onChange={(e) => setCoordinadorId(e.target.value)}
                disabled={cargando || guardando}
              >
                <option value="">Seleccionar coordinador</option>

                {coordinadoresActivos.map((coordinador) => (
                  <option key={coordinador.id} value={coordinador.id}>
                    {coordinador.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Materia</span>

              <select
                value={materiaId}
                onChange={(e) => setMateriaId(e.target.value)}
                disabled={cargando || guardando}
              >
                <option value="">Seleccionar materia</option>

                {materias.map((materia) => (
                  <option key={materia.id} value={materia.id}>
                    {materia.nombre} · {materia.periodo_id}
                  </option>
                ))}
              </select>
            </label>

            {coordinadoresActivos.length === 0 && (
              <p className="helper-text">
                No hay coordinadores activos. Primero marca un profesor como
                coordinador en la página de profesores.
              </p>
            )}

            {materias.length === 0 && (
              <p className="helper-text">
                No hay materias activas. Primero crea una materia.
              </p>
            )}

            <button
              type="submit"
              className="primary-button"
              disabled={
                guardando ||
                cargando ||
                coordinadoresActivos.length === 0 ||
                materias.length === 0
              }
            >
              {guardando ? 'Asignando...' : 'Asignar materia'}
            </button>
          </form>
        </section>

        <section className="summary-grid">
          <article>
            <span>Coord.</span>
            <strong>{coordinadoresActivos.length}</strong>
          </article>

          <article>
            <span>Materias</span>
            <strong>{materias.length}</strong>
          </article>

          <article>
            <span>Activas</span>
            <strong>{totalActivas}</strong>
          </article>

          <article>
            <span>Inactivas</span>
            <strong>{totalInactivas}</strong>
          </article>
        </section>

        <section className="content-card">
          <div className="section-header">
            <p className="section-label">Asignaciones</p>

            <button
              className={verSoloActivas ? 'toggle-button active' : 'toggle-button'}
              onClick={() => setVerSoloActivas(!verSoloActivas)}
            >
              {verSoloActivas ? 'Activas' : 'Todas'}
            </button>
          </div>

          <input
            className="search-input"
            type="text"
            value={busqueda}
            placeholder="Buscar coordinador o materia"
            onChange={(e) => setBusqueda(e.target.value)}
          />

          {cargando && <p className="empty-text">Cargando asignaciones...</p>}

          {!cargando && asignacionesFiltradas.length === 0 && (
            <p className="empty-text">No hay asignaciones para mostrar.</p>
          )}

          <div className="compact-list">
            {asignacionesFiltradas.map((asignacion) => (
              <article
                key={`${asignacion.coordinador_id}-${asignacion.materia_id}`}
                className="compact-row"
              >
                <div className="assignment-main">
                  <strong>{asignacion.coordinador_nombre}</strong>

                  <span>{asignacion.coordinador_correo}</span>

                  <small>
                    {asignacion.materia_nombre} · {asignacion.materia_codigo} ·{' '}
                    {asignacion.materia_periodo}
                  </small>
                </div>

                <span className={asignacion.estado ? 'status active' : 'status inactive'}>
                  {asignacion.estado ? 'Activa' : 'Inactiva'}
                </span>

                <button
                  className={asignacion.estado ? 'danger-button' : 'activate-button'}
                  onClick={() => cambiarEstadoAsignacion(asignacion)}
                >
                  {asignacion.estado ? 'Inactivar' : 'Activar'}
                </button>
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

  .field select,
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

  .field select:focus,
  .search-input:focus {
    border-color: #c8102e;
    box-shadow: 0 0 0 3px rgba(200, 16, 46, 0.12);
  }

  .helper-text {
    margin: -2px 0 0;
    color: #666666;
    font-size: 12px;
    line-height: 1.4;
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

  .refresh-button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
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

  .assignment-main {
    margin-bottom: 10px;
  }

  .assignment-main strong {
    display: block;
    color: #111111;
    font-size: 15px;
    font-weight: 900;
    line-height: 1.25;
  }

  .assignment-main span,
  .assignment-main small {
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

  .danger-button,
  .activate-button {
    width: 100%;
    min-height: 36px;
    border: none;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 900;
    cursor: pointer;
    padding: 0 10px;
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