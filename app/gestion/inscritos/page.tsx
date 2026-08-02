'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

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

type Alumno = {
  id: string;
  nombre: string;
  correo: string | null;
  codigo_qr: string;
  estado: boolean;
};

type Inscrito = {
  materia_id: string;
  alumno_id: string;
  estado: boolean;
};

type InscritoVista = Inscrito & {
  alumno_nombre: string;
  alumno_correo: string;
};

function normalizarTexto(texto: string | null | undefined) {
  return String(texto || '').trim().toLowerCase();
}

export default function GestionInscritosPage() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);

  const [materias, setMaterias] = useState<Materia[]>([]);
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [inscritos, setInscritos] = useState<Inscrito[]>([]);

  const [materiaSeleccionadaId, setMateriaSeleccionadaId] = useState('');

  const [busquedaInscritos, setBusquedaInscritos] = useState('');
  const [busquedaDisponibles, setBusquedaDisponibles] = useState('');

  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);

  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    cargarPagina();
  }, []);

  const materiaSeleccionada = useMemo(() => {
    return (
      materias.find((materia) => materia.id === materiaSeleccionadaId) || null
    );
  }, [materias, materiaSeleccionadaId]);

  const alumnosPorId = useMemo(() => {
    const mapa = new Map<string, Alumno>();

    alumnos.forEach((alumno) => {
      mapa.set(alumno.id, alumno);
    });

    return mapa;
  }, [alumnos]);

  const inscritosVista = useMemo<InscritoVista[]>(() => {
    return inscritos
      .map((inscrito) => {
        const alumno = alumnosPorId.get(inscrito.alumno_id);

        return {
          ...inscrito,
          alumno_nombre: alumno?.nombre || 'Estudiante no encontrado',
          alumno_correo: alumno?.correo || '',
        };
      })
      .sort((a, b) => {
        if (a.estado !== b.estado) return a.estado ? -1 : 1;
        return a.alumno_nombre.localeCompare(b.alumno_nombre);
      });
  }, [inscritos, alumnosPorId]);

  const inscritosFiltrados = useMemo(() => {
    const texto = normalizarTexto(busquedaInscritos);

    return inscritosVista.filter((inscrito) => {
      if (!texto) return true;

      return (
        normalizarTexto(inscrito.alumno_id).includes(texto) ||
        normalizarTexto(inscrito.alumno_nombre).includes(texto) ||
        normalizarTexto(inscrito.alumno_correo).includes(texto)
      );
    });
  }, [inscritosVista, busquedaInscritos]);

  const alumnosInscritosIds = useMemo(() => {
    return new Set(inscritos.map((inscrito) => inscrito.alumno_id));
  }, [inscritos]);

  const alumnosDisponibles = useMemo(() => {
    const texto = normalizarTexto(busquedaDisponibles);

    return alumnos
      .filter((alumno) => alumno.estado)
      .filter((alumno) => !alumnosInscritosIds.has(alumno.id))
      .filter((alumno) => {
        if (!texto) return true;

        return (
          normalizarTexto(alumno.id).includes(texto) ||
          normalizarTexto(alumno.nombre).includes(texto) ||
          normalizarTexto(alumno.correo).includes(texto) ||
          normalizarTexto(alumno.codigo_qr).includes(texto)
        );
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [alumnos, alumnosInscritosIds, busquedaDisponibles]);

  const totalInscritos = inscritos.length;
  const totalActivos = inscritos.filter((inscrito) => inscrito.estado).length;
  const totalInactivos = inscritos.filter((inscrito) => !inscrito.estado).length;
  const totalDisponibles = alumnosDisponibles.length;

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

  async function cargarDatos(materiaObjetivoId = materiaSeleccionadaId) {
    setError('');

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

    const { data: alumnosData, error: alumnosError } = await supabase
      .from('alumnos')
      .select('id, nombre, correo, codigo_qr, estado')
      .eq('estado', true)
      .order('nombre', { ascending: true });

    if (alumnosError) {
      setError(`No fue posible cargar estudiantes: ${alumnosError.message}`);
      return;
    }

    const materiasActivas = materiasData || [];
    const alumnosActivos = alumnosData || [];

    setMaterias(materiasActivas);
    setAlumnos(alumnosActivos);

    const materiaFinalId =
      materiaObjetivoId && materiasActivas.some((m) => m.id === materiaObjetivoId)
        ? materiaObjetivoId
        : materiasActivas[0]?.id || '';

    setMateriaSeleccionadaId(materiaFinalId);

    if (materiaFinalId) {
      await cargarInscritosMateria(materiaFinalId);
    } else {
      setInscritos([]);
    }
  }

  async function cargarInscritosMateria(materiaId: string) {
    setError('');

    if (!materiaId) {
      setInscritos([]);
      return;
    }

    const { data, error } = await supabase
      .from('inscritos')
      .select('materia_id, alumno_id, estado')
      .eq('materia_id', materiaId);

    if (error) {
      setError(`No fue posible cargar inscritos: ${error.message}`);
      return;
    }

    setInscritos(data || []);
  }

  async function cambiarMateria(materiaId: string) {
    setMateriaSeleccionadaId(materiaId);
    setBusquedaInscritos('');
    setBusquedaDisponibles('');
    setError('');
    setMensaje('');
    await cargarInscritosMateria(materiaId);
  }

  async function inscribirAlumno(alumnoId: string) {
    setError('');
    setMensaje('');

    if (!materiaSeleccionadaId) {
      setError('Selecciona una materia.');
      return;
    }

    setProcesando(true);

    const { error } = await supabase.from('inscritos').upsert(
      {
        materia_id: materiaSeleccionadaId,
        alumno_id: alumnoId,
        estado: true,
      },
      {
        onConflict: 'materia_id,alumno_id',
      }
    );

    setProcesando(false);

    if (error) {
      setError(`No fue posible inscribir el estudiante: ${error.message}`);
      return;
    }

    setMensaje('Estudiante inscrito correctamente.');
    await cargarInscritosMateria(materiaSeleccionadaId);
  }

  async function cambiarEstadoInscrito(inscrito: InscritoVista) {
    setError('');
    setMensaje('');

    const nuevoEstado = !inscrito.estado;

    setProcesando(true);

    const { error } = await supabase
      .from('inscritos')
      .update({ estado: nuevoEstado })
      .eq('materia_id', inscrito.materia_id)
      .eq('alumno_id', inscrito.alumno_id);

    setProcesando(false);

    if (error) {
      setError(`No fue posible actualizar la inscripción: ${error.message}`);
      return;
    }

    setMensaje(
      nuevoEstado
        ? 'Inscripción activada correctamente.'
        : 'Inscripción inactivada correctamente.'
    );

    await cargarInscritosMateria(inscrito.materia_id);
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
          <h1>Inscritos</h1>
        </section>

        {error && <div className="error-message">{error}</div>}
        {mensaje && <div className="success-message">{mensaje}</div>}

        <section className="content-card">
          <div className="section-header">
            <p className="section-label">Materia</p>

            <button
              className="refresh-button"
              onClick={() => cargarDatos(materiaSeleccionadaId)}
              disabled={procesando}
            >
              Actualizar
            </button>
          </div>

          <label className="field">
            <span>Seleccionar materia</span>

            <select
              value={materiaSeleccionadaId}
              onChange={(e) => cambiarMateria(e.target.value)}
              disabled={cargando || procesando}
            >
              <option value="">Seleccionar materia</option>

              {materias.map((materia) => (
                <option key={materia.id} value={materia.id}>
                  {materia.nombre} · {materia.periodo_id}
                </option>
              ))}
            </select>
          </label>

          {materiaSeleccionada && (
            <p className="helper-text">
              {materiaSeleccionada.codigo} · {materiaSeleccionada.periodo_id}
            </p>
          )}
        </section>

        <section className="summary-grid">
          <article>
            <span>Total</span>
            <strong>{totalInscritos}</strong>
          </article>

          <article>
            <span>Activos</span>
            <strong>{totalActivos}</strong>
          </article>

          <article>
            <span>Inactivos</span>
            <strong>{totalInactivos}</strong>
          </article>

          <article>
            <span>Disponibles</span>
            <strong>{totalDisponibles}</strong>
          </article>
        </section>

        <section className="content-card">
          <div className="section-header">
            <p className="section-label">Inscritos actuales</p>
          </div>

          <input
            className="search-input"
            type="text"
            value={busquedaInscritos}
            placeholder="Buscar inscrito"
            onChange={(e) => setBusquedaInscritos(e.target.value)}
          />

          {cargando && <p className="empty-text">Cargando inscritos...</p>}

          {!cargando && inscritosFiltrados.length === 0 && (
            <p className="empty-text">No hay estudiantes inscritos.</p>
          )}

          <div className="compact-list">
            {inscritosFiltrados.map((inscrito) => (
              <article
                key={`${inscrito.materia_id}-${inscrito.alumno_id}`}
                className="compact-row"
              >
                <div className="student-main">
                  <strong>{inscrito.alumno_nombre}</strong>

                  <span>
                    {inscrito.alumno_id}
                    {inscrito.alumno_correo
                      ? ` · ${inscrito.alumno_correo}`
                      : ''}
                  </span>
                </div>

                <span className={inscrito.estado ? 'status active' : 'status inactive'}>
                  {inscrito.estado ? 'Activo' : 'Inactivo'}
                </span>

                <button
                  className={inscrito.estado ? 'danger-button' : 'activate-button'}
                  onClick={() => cambiarEstadoInscrito(inscrito)}
                  disabled={procesando}
                >
                  {inscrito.estado ? 'Inactivar' : 'Activar'}
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="content-card">
          <div className="section-header">
            <p className="section-label">Estudiantes disponibles</p>
          </div>

          <input
            className="search-input"
            type="text"
            value={busquedaDisponibles}
            placeholder="Buscar estudiante"
            onChange={(e) => setBusquedaDisponibles(e.target.value)}
          />

          {!cargando && alumnosDisponibles.length === 0 && (
            <p className="empty-text">No hay estudiantes disponibles.</p>
          )}

          <div className="compact-list">
            {alumnosDisponibles.map((alumno) => (
              <article key={alumno.id} className="compact-row available-row">
                <div className="student-main">
                  <strong>{alumno.nombre}</strong>

                  <span>
                    {alumno.id}
                    {alumno.correo ? ` · ${alumno.correo}` : ''}
                  </span>
                </div>

                <button
                  className="add-button"
                  onClick={() => inscribirAlumno(alumno.id)}
                  disabled={procesando || !materiaSeleccionadaId}
                >
                  Inscribir
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
    margin: 10px 0 0;
    color: #666666;
    font-size: 12px;
    font-weight: 800;
    line-height: 1.4;
  }

  .refresh-button {
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

  .available-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 10px;
    align-items: center;
  }

  .student-main {
    min-width: 0;
    margin-bottom: 10px;
  }

  .available-row .student-main {
    margin-bottom: 0;
  }

  .student-main strong {
    display: block;
    color: #111111;
    font-size: 15px;
    font-weight: 900;
    line-height: 1.25;
  }

  .student-main span {
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
  .activate-button,
  .add-button {
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

  .add-button {
    width: auto;
    min-width: 86px;
    background: #111111;
    color: #ffffff;
  }

  .danger-button:disabled,
  .activate-button:disabled,
  .add-button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
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

    .available-row {
      grid-template-columns: 1fr;
    }

    .add-button {
      width: 100%;
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