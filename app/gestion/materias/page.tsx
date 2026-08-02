'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Usuario = {
  id: string;
  nombre: string;
  correo: string;
};

type Periodo = {
  id: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: boolean;
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

type MateriaVista = Materia & {
  profesor_nombre: string;
  profesor_correo: string;
};

function normalizarTexto(texto: string | null | undefined) {
  return String(texto || '').trim().toLowerCase();
}

function limpiarParaId(texto: string) {
  return texto
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase();
}

function generarMateriaId(codigo: string, periodoId: string, profesorId: string) {
  const codigoLimpio = limpiarParaId(codigo);
  const periodoLimpio = limpiarParaId(periodoId);
  const profesorLimpio = limpiarParaId(profesorId);

  if (!codigoLimpio || !periodoLimpio || !profesorLimpio) {
    return '';
  }

  return `${codigoLimpio}-${periodoLimpio}-${profesorLimpio}`;
}

function formatearFecha(fecha: string) {
  if (!fecha) return '';

  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${fecha}T00:00:00`));
}

export default function GestionMateriasPage() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);

  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [profesores, setProfesores] = useState<Profesor[]>([]);
  const [materias, setMaterias] = useState<Materia[]>([]);

  const [editandoId, setEditandoId] = useState('');

  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [periodoId, setPeriodoId] = useState('');
  const [profesorId, setProfesorId] = useState('');

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

  const periodosPorId = useMemo(() => {
    const mapa = new Map<string, Periodo>();

    periodos.forEach((periodo) => {
      mapa.set(periodo.id, periodo);
    });

    return mapa;
  }, [periodos]);

  const materiasVista = useMemo<MateriaVista[]>(() => {
    return materias
      .map((materia) => {
        const profesor = profesoresPorId.get(materia.profesor_id);

        return {
          ...materia,
          profesor_nombre: profesor?.nombre || 'Profesor no encontrado',
          profesor_correo: profesor?.correo || '',
        };
      })
      .sort((a, b) => {
        if (a.estado !== b.estado) return a.estado ? -1 : 1;

        return (
          b.periodo_id.localeCompare(a.periodo_id) ||
          a.nombre.localeCompare(b.nombre)
        );
      });
  }, [materias, profesoresPorId]);

  const materiasFiltradas = useMemo(() => {
    const texto = normalizarTexto(busqueda);

    return materiasVista
      .filter((materia) => {
        if (verSoloActivas) return materia.estado;
        return true;
      })
      .filter((materia) => {
        if (!texto) return true;

        return (
          normalizarTexto(materia.id).includes(texto) ||
          normalizarTexto(materia.codigo).includes(texto) ||
          normalizarTexto(materia.nombre).includes(texto) ||
          normalizarTexto(materia.periodo_id).includes(texto) ||
          normalizarTexto(materia.profesor_nombre).includes(texto) ||
          normalizarTexto(materia.profesor_correo).includes(texto)
        );
      });
  }, [materiasVista, busqueda, verSoloActivas]);

  const materiaIdSugerido = editandoId || generarMateriaId(codigo, periodoId, profesorId);

  const totalActivas = materias.filter((materia) => materia.estado).length;
  const totalInactivas = materias.filter((materia) => !materia.estado).length;
  const totalPeriodosActivos = periodos.filter((periodo) => periodo.estado).length;
  const totalProfesoresActivos = profesores.filter((profesor) => profesor.estado).length;

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

    const { data: periodosData, error: periodosError } = await supabase
      .from('periodos')
      .select('id, fecha_inicio, fecha_fin, estado')
      .order('id', { ascending: false });

    if (periodosError) {
      setError(`No fue posible cargar periodos: ${periodosError.message}`);
      return;
    }

    const { data: profesoresData, error: profesoresError } = await supabase
      .from('profesores')
      .select('id, nombre, correo, estado')
      .order('nombre', { ascending: true });

    if (profesoresError) {
      setError(`No fue posible cargar profesores: ${profesoresError.message}`);
      return;
    }

    const { data: materiasData, error: materiasError } = await supabase
      .from('materias')
      .select('id, codigo, nombre, periodo_id, profesor_id, estado')
      .order('periodo_id', { ascending: false })
      .order('nombre', { ascending: true });

    if (materiasError) {
      setError(`No fue posible cargar materias: ${materiasError.message}`);
      return;
    }

    const periodosLista = periodosData || [];
    const profesoresLista = profesoresData || [];

    setPeriodos(periodosLista);
    setProfesores(profesoresLista);
    setMaterias(materiasData || []);

    const primerPeriodoActivo = periodosLista.find((periodo) => periodo.estado);
    const primerProfesorActivo = profesoresLista.find((profesor) => profesor.estado);

    if (!periodoId && primerPeriodoActivo) {
      setPeriodoId(primerPeriodoActivo.id);
    }

    if (!profesorId && primerProfesorActivo) {
      setProfesorId(primerProfesorActivo.id);
    }
  }

  async function guardarMateria(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError('');
    setMensaje('');

    const codigoLimpio = codigo.trim().toUpperCase();
    const nombreLimpio = nombre.trim();
    const periodoLimpio = periodoId.trim();
    const profesorLimpio = profesorId.trim();

    if (!codigoLimpio) {
      setError('Escribe el código de la materia.');
      return;
    }

    if (!nombreLimpio) {
      setError('Escribe el nombre de la materia.');
      return;
    }

    if (!periodoLimpio) {
      setError('Selecciona un periodo.');
      return;
    }

    if (!profesorLimpio) {
      setError('Selecciona un profesor.');
      return;
    }

    const periodoSeleccionado = periodosPorId.get(periodoLimpio);
    const profesorSeleccionado = profesoresPorId.get(profesorLimpio);

    if (!periodoSeleccionado?.estado) {
      setError('El periodo seleccionado no está activo.');
      return;
    }

    if (!profesorSeleccionado?.estado) {
      setError('El profesor seleccionado no está activo.');
      return;
    }

    setGuardando(true);

    if (editandoId) {
      const { error } = await supabase
        .from('materias')
        .update({
          codigo: codigoLimpio,
          nombre: nombreLimpio,
          periodo_id: periodoLimpio,
          profesor_id: profesorLimpio,
        })
        .eq('id', editandoId);

      setGuardando(false);

      if (error) {
        if (error.code === '23505') {
          setError(
            'Ya existe una materia con ese código, periodo y profesor.'
          );
        } else {
          setError(`No fue posible actualizar la materia: ${error.message}`);
        }

        return;
      }

      setMensaje('Materia actualizada correctamente.');
      limpiarFormulario();
      await cargarDatos();
      return;
    }

    const nuevoId = generarMateriaId(codigoLimpio, periodoLimpio, profesorLimpio);

    if (!nuevoId) {
      setError('No fue posible generar el código interno de la materia.');
      setGuardando(false);
      return;
    }

    const { error } = await supabase.from('materias').insert({
      id: nuevoId,
      codigo: codigoLimpio,
      nombre: nombreLimpio,
      periodo_id: periodoLimpio,
      profesor_id: profesorLimpio,
      estado: true,
    });

    setGuardando(false);

    if (error) {
      if (error.code === '23505') {
        setError('Ya existe una materia con ese código interno o combinación.');
      } else {
        setError(`No fue posible crear la materia: ${error.message}`);
      }

      return;
    }

    setMensaje('Materia creada correctamente.');
    limpiarFormulario();
    await cargarDatos();
  }

  function editarMateria(materia: MateriaVista) {
    setEditandoId(materia.id);
    setCodigo(materia.codigo);
    setNombre(materia.nombre);
    setPeriodoId(materia.periodo_id);
    setProfesorId(materia.profesor_id);
    setError('');
    setMensaje('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function cambiarEstadoMateria(materia: MateriaVista) {
    setError('');
    setMensaje('');

    const nuevoEstado = !materia.estado;

    const { error } = await supabase
      .from('materias')
      .update({ estado: nuevoEstado })
      .eq('id', materia.id);

    if (error) {
      setError(`No fue posible actualizar la materia: ${error.message}`);
      return;
    }

    setMensaje(
      nuevoEstado
        ? 'Materia activada correctamente.'
        : 'Materia inactivada correctamente.'
    );

    await cargarDatos();
  }

  function abrirMateria(materia: MateriaVista) {
    window.location.href = `/materia?codigo=${encodeURIComponent(materia.id)}`;
  }

  function limpiarFormulario() {
    const primerPeriodoActivo = periodos.find((periodo) => periodo.estado);
    const primerProfesorActivo = profesores.find((profesor) => profesor.estado);

    setEditandoId('');
    setCodigo('');
    setNombre('');
    setPeriodoId(primerPeriodoActivo?.id || '');
    setProfesorId(primerProfesorActivo?.id || '');
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
          <h1>Materias</h1>
        </section>

        {error && <div className="error-message">{error}</div>}
        {mensaje && <div className="success-message">{mensaje}</div>}

        <section className="content-card">
          <div className="section-header">
            <p className="section-label">
              {editandoId ? 'Editar materia' : 'Nueva materia'}
            </p>

            {editandoId && (
              <button className="refresh-button" onClick={limpiarFormulario}>
                Cancelar
              </button>
            )}
          </div>

          <form className="form" onSubmit={guardarMateria}>
            <label className="field">
              <span>Código de materia</span>

              <input
                type="text"
                value={codigo}
                placeholder="Ej. PROG-001"
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              />
            </label>

            <label className="field">
              <span>Nombre</span>

              <input
                type="text"
                value={nombre}
                placeholder="Ej. Empezando a programar"
                onChange={(e) => setNombre(e.target.value)}
              />
            </label>

            <label className="field">
              <span>Periodo</span>

              <select
                value={periodoId}
                onChange={(e) => setPeriodoId(e.target.value)}
              >
                <option value="">Seleccionar periodo</option>

                {periodos
                  .filter((periodo) => periodo.estado || periodo.id === periodoId)
                  .map((periodo) => (
                    <option key={periodo.id} value={periodo.id}>
                      {periodo.id} · {formatearFecha(periodo.fecha_inicio)} -{' '}
                      {formatearFecha(periodo.fecha_fin)}
                    </option>
                  ))}
              </select>
            </label>

            <label className="field">
              <span>Profesor responsable</span>

              <select
                value={profesorId}
                onChange={(e) => setProfesorId(e.target.value)}
              >
                <option value="">Seleccionar profesor</option>

                {profesores
                  .filter((profesor) => profesor.estado || profesor.id === profesorId)
                  .map((profesor) => (
                    <option key={profesor.id} value={profesor.id}>
                      {profesor.nombre} · {profesor.id}
                    </option>
                  ))}
              </select>
            </label>

            <label className="field">
              <span>Código interno</span>

              <input
                type="text"
                value={materiaIdSugerido}
                placeholder="Se genera automáticamente"
                disabled
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
                  : 'Crear materia'}
            </button>
          </form>
        </section>

        <section className="summary-grid">
          <article>
            <span>Activas</span>
            <strong>{totalActivas}</strong>
          </article>

          <article>
            <span>Inactivas</span>
            <strong>{totalInactivas}</strong>
          </article>

          <article>
            <span>Periodos</span>
            <strong>{totalPeriodosActivos}</strong>
          </article>

          <article>
            <span>Profesores</span>
            <strong>{totalProfesoresActivos}</strong>
          </article>
        </section>

        <section className="content-card">
          <div className="section-header">
            <p className="section-label">Listado</p>

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
            placeholder="Buscar materia, profesor o periodo"
            onChange={(e) => setBusqueda(e.target.value)}
          />

          {cargando && <p className="empty-text">Cargando materias...</p>}

          {!cargando && materiasFiltradas.length === 0 && (
            <p className="empty-text">No hay materias para mostrar.</p>
          )}

          <div className="compact-list">
            {materiasFiltradas.map((materia) => (
              <article key={materia.id} className="compact-row">
                <div className="subject-main">
                  <strong>{materia.nombre}</strong>

                  <span>
                    {materia.codigo} · {materia.periodo_id}
                  </span>

                  <small>{materia.profesor_nombre}</small>

                  <small>{materia.id}</small>
                </div>

                <span className={materia.estado ? 'status active' : 'status inactive'}>
                  {materia.estado ? 'Activa' : 'Inactiva'}
                </span>

                <div className="actions">
                  <button
                    className="open-button"
                    onClick={() => abrirMateria(materia)}
                  >
                    Abrir
                  </button>

                  <button
                    className="edit-button"
                    onClick={() => editarMateria(materia)}
                  >
                    Editar
                  </button>

                  <button
                    className={materia.estado ? 'danger-button' : 'activate-button'}
                    onClick={() => cambiarEstadoMateria(materia)}
                  >
                    {materia.estado ? 'Inactivar' : 'Activar'}
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
  .field select,
  .search-input {
    width: 100%;
    min-height: 48px;
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
  .field select:focus,
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

  .subject-main {
    margin-bottom: 10px;
  }

  .subject-main strong {
    display: block;
    color: #111111;
    font-size: 15px;
    font-weight: 900;
    line-height: 1.25;
  }

  .subject-main span,
  .subject-main small {
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
    grid-template-columns: repeat(3, 1fr);
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

  .open-button {
    background: #111111;
    color: #ffffff;
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
    .summary-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .actions {
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