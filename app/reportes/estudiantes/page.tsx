'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
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

type Alumno = {
  id: string;
  nombre: string;
  correo: string | null;
};

type Inscrito = {
  materia_id: string;
  alumno_id: string;
  estado: boolean;
};

type Sesion = {
  materia_id: string;
  fecha: string;
  hora_inicio: string;
  estado: string;
};

type Asistencia = {
  materia_id: string;
  fecha: string;
  hora_inicio: string;
  alumno_id: string;
  estado: string;
  fecha_hora_registro: string | null;
};

type DetalleSesion = {
  materia_id: string;
  materia_nombre: string;
  fecha: string;
  hora_inicio: string;
  estado: string;
};

type ResumenMateria = {
  materia_id: string;
  materia_nombre: string;
  totalSesiones: number;
  presente: number;
  tarde: number;
  ausente: number;
  justificado: number;
  pendiente: number;
  porcentaje: number;
};

type ResumenGeneral = {
  porcentajeGeneral: number;
  totalMaterias: number;
  totalSesiones: number;
  totalAusencias: number;
};

function fechaLocalISO(fecha = new Date()) {
  const year = fecha.getFullYear();
  const month = String(fecha.getMonth() + 1).padStart(2, '0');
  const day = String(fecha.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function primerDiaMesISO() {
  const hoy = new Date();
  return fechaLocalISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
}

function normalizarTexto(texto: string | null | undefined) {
  return String(texto || '').trim().toLowerCase();
}

function formatearFecha(fecha: string) {
  if (!fecha) return '';

  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${fecha}T00:00:00`));
}

function mostrarHora(hora: string) {
  if (!hora) return '';
  return hora.slice(0, 5);
}

function claveSesion(materiaId: string, fecha: string, hora: string) {
  return `${materiaId}|${fecha}|${hora}`;
}

function escaparCSV(valor: string | number) {
  const texto = String(valor ?? '');
  return `"${texto.replace(/"/g, '""')}"`;
}

export default function ReporteEstudiantesPage() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [rol, setRol] = useState<RolUsuario>('Profesor');

  const [materiasPermitidas, setMateriasPermitidas] = useState<Materia[]>([]);
  const [estudiantes, setEstudiantes] = useState<Alumno[]>([]);

  const [estudianteSeleccionadoId, setEstudianteSeleccionadoId] = useState('');
  const [fechaDesde, setFechaDesde] = useState(primerDiaMesISO());
  const [fechaHasta, setFechaHasta] = useState(fechaLocalISO());

  const [resumenGeneral, setResumenGeneral] = useState<ResumenGeneral>({
    porcentajeGeneral: 0,
    totalMaterias: 0,
    totalSesiones: 0,
    totalAusencias: 0,
  });

  const [resumenPorMateria, setResumenPorMateria] = useState<ResumenMateria[]>([]);
  const [detalleSesiones, setDetalleSesiones] = useState<DetalleSesion[]>([]);

  const [busquedaEstudiante, setBusquedaEstudiante] = useState('');
  const [busquedaDetalle, setBusquedaDetalle] = useState('');

  const [cargando, setCargando] = useState(true);
  const [consultando, setConsultando] = useState(false);

  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    cargarPagina();
  }, []);

  const materiasPorId = useMemo(() => {
    const mapa = new Map<string, Materia>();

    materiasPermitidas.forEach((materia) => {
      mapa.set(materia.id, materia);
    });

    return mapa;
  }, [materiasPermitidas]);

  const estudianteSeleccionado = useMemo(() => {
    return (
      estudiantes.find((estudiante) => estudiante.id === estudianteSeleccionadoId) ||
      null
    );
  }, [estudiantes, estudianteSeleccionadoId]);

  const estudiantesFiltrados = useMemo(() => {
    const texto = normalizarTexto(busquedaEstudiante);

    return estudiantes
      .filter((estudiante) => {
        if (!texto) return true;

        return (
          normalizarTexto(estudiante.nombre).includes(texto) ||
          normalizarTexto(estudiante.id).includes(texto) ||
          normalizarTexto(estudiante.correo).includes(texto)
        );
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [estudiantes, busquedaEstudiante]);

  const detalleFiltrado = useMemo(() => {
    const texto = normalizarTexto(busquedaDetalle);

    return detalleSesiones.filter((detalle) => {
      if (!texto) return true;

      return (
        normalizarTexto(detalle.materia_nombre).includes(texto) ||
        normalizarTexto(detalle.estado).includes(texto) ||
        normalizarTexto(detalle.fecha).includes(texto)
      );
    });
  }, [detalleSesiones, busquedaDetalle]);

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

    const rolDetectado = await detectarRol(usuarioData.id);
    setRol(rolDetectado);

    const materias = await cargarMateriasPermitidas(usuarioData.id, rolDetectado);
    setMateriasPermitidas(materias);

    const estudiantesPermitidos = await cargarEstudiantesPermitidos(materias);
    setEstudiantes(estudiantesPermitidos);

    if (estudiantesPermitidos.length > 0) {
      setEstudianteSeleccionadoId(estudiantesPermitidos[0].id);
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

  async function cargarMateriasPermitidas(
    profesorId: string,
    rolDetectado: RolUsuario
  ) {
    if (rolDetectado === 'Administrador') {
      const { data, error } = await supabase
        .from('materias')
        .select('id, codigo, nombre, periodo_id, profesor_id, estado')
        .eq('estado', true)
        .order('periodo_id', { ascending: false })
        .order('nombre', { ascending: true });

      if (error) {
        setError(`No fue posible cargar materias: ${error.message}`);
        return [];
      }

      return data || [];
    }

    if (rolDetectado === 'Coordinador') {
      const { data: asignaciones, error: asignacionesError } = await supabase
        .from('coordinador_materias')
        .select('materia_id')
        .eq('coordinador_id', profesorId)
        .eq('estado', true);

      if (asignacionesError) {
        setError(
          `No fue posible cargar materias coordinadas: ${asignacionesError.message}`
        );
        return [];
      }

      const materiaIds = (asignaciones || []).map((item) => item.materia_id);

      if (materiaIds.length === 0) {
        return [];
      }

      const { data, error } = await supabase
        .from('materias')
        .select('id, codigo, nombre, periodo_id, profesor_id, estado')
        .in('id', materiaIds)
        .eq('estado', true)
        .order('periodo_id', { ascending: false })
        .order('nombre', { ascending: true });

      if (error) {
        setError(`No fue posible cargar materias coordinadas: ${error.message}`);
        return [];
      }

      return data || [];
    }

    const { data, error } = await supabase
      .from('materias')
      .select('id, codigo, nombre, periodo_id, profesor_id, estado')
      .eq('profesor_id', profesorId)
      .eq('estado', true)
      .order('periodo_id', { ascending: false })
      .order('nombre', { ascending: true });

    if (error) {
      setError(`No fue posible cargar tus materias: ${error.message}`);
      return [];
    }

    return data || [];
  }

  async function cargarEstudiantesPermitidos(materias: Materia[]) {
    const materiaIds = materias.map((materia) => materia.id);

    if (materiaIds.length === 0) {
      return [];
    }

    const { data: inscritosData, error: inscritosError } = await supabase
      .from('inscritos')
      .select('materia_id, alumno_id, estado')
      .in('materia_id', materiaIds)
      .eq('estado', true);

    if (inscritosError) {
      setError(`No fue posible cargar inscritos: ${inscritosError.message}`);
      return [];
    }

    const alumnoIds = Array.from(
      new Set((inscritosData || []).map((inscrito) => inscrito.alumno_id))
    );

    if (alumnoIds.length === 0) {
      return [];
    }

    const { data: alumnosData, error: alumnosError } = await supabase
      .from('alumnos')
      .select('id, nombre, correo')
      .in('id', alumnoIds)
      .eq('estado', true)
      .order('nombre', { ascending: true });

    if (alumnosError) {
      setError(`No fue posible cargar estudiantes: ${alumnosError.message}`);
      return [];
    }

    return alumnosData || [];
  }

  async function consultarReporte(e?: FormEvent<HTMLFormElement>) {
    if (e) {
      e.preventDefault();
    }

    setError('');
    setMensaje('');

    if (!estudianteSeleccionadoId) {
      setError('Selecciona un estudiante.');
      return;
    }

    if (!fechaDesde || !fechaHasta) {
      setError('Selecciona el rango de fechas.');
      return;
    }

    if (fechaHasta < fechaDesde) {
      setError('La fecha final no puede ser menor que la fecha inicial.');
      return;
    }

    const materiaIdsPermitidas = materiasPermitidas.map((materia) => materia.id);

    if (materiaIdsPermitidas.length === 0) {
      setError('No tienes materias disponibles para consultar.');
      return;
    }

    setConsultando(true);

    const { data: inscritosData, error: inscritosError } = await supabase
      .from('inscritos')
      .select('materia_id, alumno_id, estado')
      .eq('alumno_id', estudianteSeleccionadoId)
      .in('materia_id', materiaIdsPermitidas)
      .eq('estado', true);

    if (inscritosError) {
      setConsultando(false);
      setError(`No fue posible cargar materias del estudiante: ${inscritosError.message}`);
      return;
    }

    const inscritos = inscritosData || [];
    const materiaIdsEstudiante = inscritos.map(
      (inscrito: Inscrito) => inscrito.materia_id
    );

    if (materiaIdsEstudiante.length === 0) {
      setConsultando(false);
      setResumenGeneral({
        porcentajeGeneral: 0,
        totalMaterias: 0,
        totalSesiones: 0,
        totalAusencias: 0,
      });
      setResumenPorMateria([]);
      setDetalleSesiones([]);
      setMensaje('El estudiante no tiene materias inscritas dentro de tus permisos.');
      return;
    }

    const { data: sesionesData, error: sesionesError } = await supabase
      .from('sesiones')
      .select('materia_id, fecha, hora_inicio, estado')
      .in('materia_id', materiaIdsEstudiante)
      .gte('fecha', fechaDesde)
      .lte('fecha', fechaHasta)
      .order('fecha', { ascending: true })
      .order('hora_inicio', { ascending: true });

    if (sesionesError) {
      setConsultando(false);
      setError(`No fue posible cargar sesiones: ${sesionesError.message}`);
      return;
    }

    const sesiones = sesionesData || [];

    const { data: asistenciasData, error: asistenciasError } = await supabase
      .from('asistencias')
      .select(
        'materia_id, fecha, hora_inicio, alumno_id, estado, fecha_hora_registro'
      )
      .eq('alumno_id', estudianteSeleccionadoId)
      .in('materia_id', materiaIdsEstudiante)
      .gte('fecha', fechaDesde)
      .lte('fecha', fechaHasta);

    if (asistenciasError) {
      setConsultando(false);
      setError(`No fue posible cargar asistencias: ${asistenciasError.message}`);
      return;
    }

    const asistencias = asistenciasData || [];
    const asistenciasPorSesion = new Map<string, Asistencia>();

    asistencias.forEach((asistencia: Asistencia) => {
      asistenciasPorSesion.set(
        claveSesion(asistencia.materia_id, asistencia.fecha, asistencia.hora_inicio),
        asistencia
      );
    });

    const resumenMapa = new Map<string, ResumenMateria>();
    const detalle: DetalleSesion[] = [];

    materiaIdsEstudiante.forEach((materiaId) => {
      const materia = materiasPorId.get(materiaId);

      resumenMapa.set(materiaId, {
        materia_id: materiaId,
        materia_nombre: materia?.nombre || materiaId,
        totalSesiones: 0,
        presente: 0,
        tarde: 0,
        ausente: 0,
        justificado: 0,
        pendiente: 0,
        porcentaje: 0,
      });
    });

    sesiones.forEach((sesion: Sesion) => {
      const materia = materiasPorId.get(sesion.materia_id);
      const clave = claveSesion(
        sesion.materia_id,
        sesion.fecha,
        sesion.hora_inicio
      );

      const asistencia = asistenciasPorSesion.get(clave);
      const estado = asistencia?.estado || 'Pendiente';

      const resumenMateria = resumenMapa.get(sesion.materia_id);

      if (resumenMateria) {
        resumenMateria.totalSesiones += 1;

        if (estado === 'Presente') resumenMateria.presente += 1;
        else if (estado === 'Tarde') resumenMateria.tarde += 1;
        else if (estado === 'Ausente') resumenMateria.ausente += 1;
        else if (estado === 'Justificado') resumenMateria.justificado += 1;
        else resumenMateria.pendiente += 1;
      }

      detalle.push({
        materia_id: sesion.materia_id,
        materia_nombre: materia?.nombre || sesion.materia_id,
        fecha: sesion.fecha,
        hora_inicio: sesion.hora_inicio,
        estado,
      });
    });

    const resumenMaterias = Array.from(resumenMapa.values())
      .map((item) => {
        const asistenciasValidas = item.presente + item.tarde + item.justificado;

        return {
          ...item,
          porcentaje:
            item.totalSesiones > 0
              ? Math.round((asistenciasValidas / item.totalSesiones) * 1000) / 10
              : 0,
        };
      })
      .sort((a, b) => a.materia_nombre.localeCompare(b.materia_nombre));

    const totalSesiones = resumenMaterias.reduce(
      (total, item) => total + item.totalSesiones,
      0
    );

    const totalAsistenciasValidas = resumenMaterias.reduce(
      (total, item) => total + item.presente + item.tarde + item.justificado,
      0
    );

    const totalAusencias = resumenMaterias.reduce(
      (total, item) => total + item.ausente,
      0
    );

    const porcentajeGeneral =
      totalSesiones > 0
        ? Math.round((totalAsistenciasValidas / totalSesiones) * 1000) / 10
        : 0;

    setResumenPorMateria(resumenMaterias);
    setDetalleSesiones(detalle);
    setResumenGeneral({
      porcentajeGeneral,
      totalMaterias: resumenMaterias.length,
      totalSesiones,
      totalAusencias,
    });

    setConsultando(false);

    if (sesiones.length === 0) {
      setMensaje('No hay sesiones registradas en el rango seleccionado.');
    } else {
      setMensaje('Reporte generado correctamente.');
    }
  }

  function exportarCSV() {
    if (!estudianteSeleccionado || detalleSesiones.length === 0) {
      setError('Primero genera un reporte con detalle.');
      return;
    }

    const encabezados = [
      'Código estudiante',
      'Nombre estudiante',
      'Correo',
      'Materia',
      'Fecha',
      'Hora',
      'Estado',
    ];

    const filas = detalleSesiones.map((detalle) => [
      estudianteSeleccionado.id,
      estudianteSeleccionado.nombre,
      estudianteSeleccionado.correo || '',
      detalle.materia_nombre,
      detalle.fecha,
      mostrarHora(detalle.hora_inicio),
      detalle.estado,
    ]);

    const contenido = [encabezados, ...filas]
      .map((fila) => fila.map(escaparCSV).join(';'))
      .join('\n');

    const blob = new Blob([`\uFEFF${contenido}`], {
      type: 'text/csv;charset=utf-8;',
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `reporte-estudiante-${estudianteSeleccionado.id}-${fechaDesde}-${fechaHasta}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  function limpiarReporte() {
    setResumenGeneral({
      porcentajeGeneral: 0,
      totalMaterias: 0,
      totalSesiones: 0,
      totalAusencias: 0,
    });
    setResumenPorMateria([]);
    setDetalleSesiones([]);
    setMensaje('');
    setError('');
  }

  function cambiarEstudiante(estudianteId: string) {
    setEstudianteSeleccionadoId(estudianteId);
    limpiarReporte();
  }

  function volver() {
    window.location.href = '/reportes';
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
          <h1>Reporte por estudiante</h1>
          <p>{rol}</p>
        </section>

        {error && <div className="error-message">{error}</div>}
        {mensaje && <div className="success-message">{mensaje}</div>}

        <section className="content-card">
          <form className="form" onSubmit={consultarReporte}>
            <label className="field">
              <span>Buscar estudiante</span>

              <input
                type="text"
                value={busquedaEstudiante}
                placeholder="Buscar por nombre, código o correo"
                onChange={(e) => setBusquedaEstudiante(e.target.value)}
              />
            </label>

            <label className="field">
              <span>Estudiante</span>

              <select
                value={estudianteSeleccionadoId}
                onChange={(e) => cambiarEstudiante(e.target.value)}
                disabled={cargando}
              >
                <option value="">Seleccionar estudiante</option>

                {estudiantesFiltrados.map((estudiante) => (
                  <option key={estudiante.id} value={estudiante.id}>
                    {estudiante.nombre} · {estudiante.id}
                  </option>
                ))}
              </select>
            </label>

            <div className="two-grid">
              <label className="field">
                <span>Desde</span>

                <input
                  type="date"
                  value={fechaDesde}
                  onChange={(e) => setFechaDesde(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Hasta</span>

                <input
                  type="date"
                  value={fechaHasta}
                  onChange={(e) => setFechaHasta(e.target.value)}
                />
              </label>
            </div>

            <button
              type="submit"
              className="primary-button"
              disabled={consultando || cargando}
            >
              {consultando ? 'Consultando...' : 'Consultar'}
            </button>
          </form>
        </section>

        <section className="summary-grid">
          <article>
            <span>Asistencia</span>
            <strong>{resumenGeneral.porcentajeGeneral}%</strong>
          </article>

          <article>
            <span>Materias</span>
            <strong>{resumenGeneral.totalMaterias}</strong>
          </article>

          <article>
            <span>Sesiones</span>
            <strong>{resumenGeneral.totalSesiones}</strong>
          </article>

          <article>
            <span>Ausencias</span>
            <strong>{resumenGeneral.totalAusencias}</strong>
          </article>
        </section>

        <section className="content-card">
          <div className="section-header">
            <p className="section-label">Materias del estudiante</p>
          </div>

          {cargando && <p className="empty-text">Cargando estudiantes...</p>}

          {!cargando && resumenPorMateria.length === 0 && (
            <p className="empty-text">No hay materias para mostrar.</p>
          )}

          <div className="matter-list">
            {resumenPorMateria.map((materia) => (
              <article key={materia.materia_id} className="matter-row">
                <div className="matter-main">
                  <div>
                    <strong>{materia.materia_nombre}</strong>
                    <span>{materia.totalSesiones} sesiones</span>
                  </div>

                  <div className="percentage">{materia.porcentaje}%</div>
                </div>

                <div className="mini-stats">
                  <span>P {materia.presente}</span>
                  <span>T {materia.tarde}</span>
                  <span>A {materia.ausente}</span>
                  <span>J {materia.justificado}</span>
                  <span>Pend. {materia.pendiente}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="content-card">
          <div className="section-header">
            <p className="section-label">Detalle</p>

            <button className="export-button" onClick={exportarCSV}>
              Exportar
            </button>
          </div>

          <input
            className="search-input"
            type="text"
            value={busquedaDetalle}
            placeholder="Buscar materia, estado o fecha"
            onChange={(e) => setBusquedaDetalle(e.target.value)}
          />

          {!cargando && !consultando && detalleFiltrado.length === 0 && (
            <p className="empty-text">No hay sesiones para mostrar.</p>
          )}

          <div className="detail-list">
            {detalleFiltrado.map((detalle) => (
              <article
                key={`${detalle.materia_id}-${detalle.fecha}-${detalle.hora_inicio}`}
                className="detail-row"
              >
                <div className="detail-main">
                  <strong>{detalle.materia_nombre}</strong>

                  <span>
                    {formatearFecha(detalle.fecha)} · {mostrarHora(detalle.hora_inicio)}
                  </span>
                </div>

                <span
                  className={
                    detalle.estado === 'Presente' ||
                    detalle.estado === 'Tarde' ||
                    detalle.estado === 'Justificado'
                      ? 'status active'
                      : detalle.estado === 'Ausente'
                        ? 'status danger'
                        : 'status neutral'
                  }
                >
                  {detalle.estado}
                </span>
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

  .field input,
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
    font-size: 19px;
    line-height: 1;
    font-weight: 900;
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

  .export-button {
    border: none;
    border-radius: 999px;
    background: #111111;
    color: #ffffff;
    font-size: 12px;
    font-weight: 900;
    padding: 9px 12px;
    cursor: pointer;
  }

  .matter-list,
  .detail-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 12px;
  }

  .matter-row,
  .detail-row {
    border: 1px solid #e5e7eb;
    border-radius: 15px;
    background: #fafafa;
    padding: 10px;
  }

  .matter-main,
  .detail-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 10px;
    align-items: center;
  }

  .matter-main strong,
  .detail-main strong {
    display: block;
    color: #111111;
    font-size: 13px;
    line-height: 1.2;
    font-weight: 900;
  }

  .matter-main span,
  .detail-main span {
    display: block;
    margin-top: 3px;
    color: #666666;
    font-size: 10px;
    font-weight: 800;
  }

  .percentage {
    min-width: 54px;
    border-radius: 999px;
    background: #111111;
    color: #ffffff;
    padding: 7px 8px;
    font-size: 12px;
    font-weight: 900;
    text-align: center;
  }

  .mini-stats {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 5px;
    margin-top: 8px;
  }

  .mini-stats span {
    border-radius: 999px;
    background: #eeeeee;
    color: #333333;
    padding: 5px 4px;
    font-size: 10px;
    font-weight: 900;
    text-align: center;
  }

  .status {
    border-radius: 999px;
    padding: 7px 8px;
    font-size: 10px;
    font-weight: 900;
    white-space: nowrap;
  }

  .status.active {
    background: #dcfce7;
    color: #166534;
  }

  .status.danger {
    background: #fee2e2;
    color: #991b1b;
  }

  .status.neutral {
    background: #eeeeee;
    color: #444444;
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