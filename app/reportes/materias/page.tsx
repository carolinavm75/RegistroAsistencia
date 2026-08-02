'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type RolUsuario = 'Administrador' | 'Coordinador' | 'Profesor';
type OrdenReporte = 'nombre' | 'apellido' | 'asistencia';

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

type Asistencia = {
  materia_id: string;
  fecha: string;
  hora_inicio: string;
  alumno_id: string;
  estado: string;
  fecha_hora_registro: string | null;
};

type EstudianteReporte = {
  id: string;
  nombre: string;
  correo: string;
  totalSesiones: number;
  presente: number;
  tarde: number;
  ausente: number;
  justificado: number;
  pendiente: number;
  porcentajeAsistencia: number;
  detalle: Record<string, string>;
};

type ResumenReporte = {
  porcentajeGeneral: number;
  totalSesiones: number;
  totalEstudiantes: number;
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

function obtenerApellido(nombre: string) {
  const partes = nombre.trim().split(/\s+/);
  return partes[partes.length - 1] || nombre;
}

function mostrarHora(hora: string) {
  if (!hora) return '';
  return hora.slice(0, 5);
}

function claveSesion(fecha: string, hora: string) {
  return `${fecha}|${hora}`;
}

function escaparCSV(valor: string | number) {
  const texto = String(valor ?? '');
  return `"${texto.replace(/"/g, '""')}"`;
}

export default function ReporteMateriasPage() {
  return (
    <Suspense fallback={<CargandoReporte />}>
      <ReporteMateriasContent />
    </Suspense>
  );
}

function CargandoReporte() {
  return (
    <main className="page">
      <section className="shell">
        <section className="loading-card">
          <div className="brand-mark">ECI</div>
          <h1>Reporte por materia</h1>
          <p>Cargando...</p>
        </section>
      </section>

      <style>{estilos}</style>
    </main>
  );
}

function ReporteMateriasContent() {
  const searchParams = useSearchParams();
  const materiaUrlId = searchParams.get('materia') || '';
  const reporteInicialGenerado = useRef(false);

  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [rol, setRol] = useState<RolUsuario>('Profesor');

  const [materias, setMaterias] = useState<Materia[]>([]);
  const [materiaSeleccionadaId, setMateriaSeleccionadaId] = useState('');

  const [fechaDesde, setFechaDesde] = useState(primerDiaMesISO());
  const [fechaHasta, setFechaHasta] = useState(fechaLocalISO());

  const [sesionesReporte, setSesionesReporte] = useState<Sesion[]>([]);
  const [estudiantesReporte, setEstudiantesReporte] = useState<
    EstudianteReporte[]
  >([]);

  const [resumen, setResumen] = useState<ResumenReporte>({
    porcentajeGeneral: 0,
    totalSesiones: 0,
    totalEstudiantes: 0,
    totalAusencias: 0,
  });

  const [busqueda, setBusqueda] = useState('');
  const [orden, setOrden] = useState<OrdenReporte>('apellido');

  const [cargando, setCargando] = useState(true);
  const [consultando, setConsultando] = useState(false);

  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    cargarPagina();
  }, []);

  useEffect(() => {
    if (!cargando && materiaSeleccionadaId && !reporteInicialGenerado.current) {
      reporteInicialGenerado.current = true;
      consultarReporte(undefined, materiaSeleccionadaId, false);
    }
  }, [cargando, materiaSeleccionadaId]);

  const materiaSeleccionada = useMemo(() => {
    return materias.find((materia) => materia.id === materiaSeleccionadaId) || null;
  }, [materias, materiaSeleccionadaId]);

  const estudiantesFiltrados = useMemo(() => {
    const texto = normalizarTexto(busqueda);

    return estudiantesReporte
      .filter((estudiante) => {
        if (!texto) return true;

        return (
          normalizarTexto(estudiante.nombre).includes(texto) ||
          normalizarTexto(estudiante.id).includes(texto) ||
          normalizarTexto(estudiante.correo).includes(texto)
        );
      })
      .sort((a, b) => {
        if (orden === 'nombre') {
          return a.nombre.localeCompare(b.nombre);
        }

        if (orden === 'apellido') {
          return (
            obtenerApellido(a.nombre).localeCompare(obtenerApellido(b.nombre)) ||
            a.nombre.localeCompare(b.nombre)
          );
        }

        return (
          a.porcentajeAsistencia - b.porcentajeAsistencia ||
          b.ausente - a.ausente ||
          b.pendiente - a.pendiente ||
          a.nombre.localeCompare(b.nombre)
        );
      });
  }, [estudiantesReporte, busqueda, orden]);

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

    const materiasPermitidas = await cargarMateriasPermitidas(
      usuarioData.id,
      rolDetectado
    );

    setMaterias(materiasPermitidas);

    if (materiaUrlId) {
      const materiaPermitida = materiasPermitidas.find(
        (materia) => materia.id === materiaUrlId
      );

      if (materiaPermitida) {
        setMateriaSeleccionadaId(materiaUrlId);
      } else {
        setMateriaSeleccionadaId(materiasPermitidas[0]?.id || '');
        setError('No tienes acceso al reporte de la materia solicitada.');
      }
    } else {
      setMateriaSeleccionadaId(materiasPermitidas[0]?.id || '');
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
  ): Promise<Materia[]> {
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

  async function consultarReporte(
    e?: FormEvent<HTMLFormElement>,
    materiaIdForzado?: string,
    mostrarMensaje = true
  ) {
    if (e) {
      e.preventDefault();
    }

    setError('');
    setMensaje('');

    const materiaIdConsulta = materiaIdForzado || materiaSeleccionadaId;

    if (!materiaIdConsulta) {
      setError('Selecciona una materia.');
      return;
    }

    const materiaPermitida = materias.find(
      (materia) => materia.id === materiaIdConsulta
    );

    if (!materiaPermitida) {
      setError('No tienes permiso para consultar esta materia.');
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

    setConsultando(true);

    const { data: sesionesData, error: sesionesError } = await supabase
      .from('sesiones')
      .select('materia_id, fecha, hora_inicio, estado')
      .eq('materia_id', materiaIdConsulta)
      .gte('fecha', fechaDesde)
      .lte('fecha', fechaHasta)
      .neq('estado', 'Cancelada')
      .order('fecha', { ascending: true })
      .order('hora_inicio', { ascending: true });

    if (sesionesError) {
      setConsultando(false);
      setError(`No fue posible cargar sesiones: ${sesionesError.message}`);
      return;
    }

    const sesiones = (sesionesData || []) as Sesion[];

    const { data: inscritosData, error: inscritosError } = await supabase
      .from('inscritos')
      .select('materia_id, alumno_id, estado')
      .eq('materia_id', materiaIdConsulta)
      .eq('estado', true);

    if (inscritosError) {
      setConsultando(false);
      setError(`No fue posible cargar inscritos: ${inscritosError.message}`);
      return;
    }

    const inscritos = (inscritosData || []) as Inscrito[];
    const alumnoIds = inscritos.map((inscrito) => inscrito.alumno_id);

    if (alumnoIds.length === 0) {
      setSesionesReporte(sesiones);
      setEstudiantesReporte([]);
      setResumen({
        porcentajeGeneral: 0,
        totalSesiones: sesiones.length,
        totalEstudiantes: 0,
        totalAusencias: 0,
      });
      setConsultando(false);

      if (mostrarMensaje) {
        setMensaje('La materia no tiene estudiantes inscritos activos.');
      }

      return;
    }

    const { data: alumnosData, error: alumnosError } = await supabase
      .from('alumnos')
      .select('id, nombre, correo')
      .in('id', alumnoIds)
      .order('nombre', { ascending: true });

    if (alumnosError) {
      setConsultando(false);
      setError(`No fue posible cargar estudiantes: ${alumnosError.message}`);
      return;
    }

    const { data: asistenciasData, error: asistenciasError } = await supabase
      .from('asistencias')
      .select(
        'materia_id, fecha, hora_inicio, alumno_id, estado, fecha_hora_registro'
      )
      .eq('materia_id', materiaIdConsulta)
      .gte('fecha', fechaDesde)
      .lte('fecha', fechaHasta);

    if (asistenciasError) {
      setConsultando(false);
      setError(`No fue posible cargar asistencias: ${asistenciasError.message}`);
      return;
    }

    const alumnos = (alumnosData || []) as Alumno[];
    const asistencias = (asistenciasData || []) as Asistencia[];

    const asistenciasPorAlumnoSesion = new Map<string, Asistencia>();

    asistencias.forEach((asistencia) => {
      asistenciasPorAlumnoSesion.set(
        `${asistencia.alumno_id}|${claveSesion(
          asistencia.fecha,
          asistencia.hora_inicio
        )}`,
        asistencia
      );
    });

    const estudiantes = alumnos.map((alumno) => {
      const detalle: Record<string, string> = {};

      let presente = 0;
      let tarde = 0;
      let ausente = 0;
      let justificado = 0;
      let pendiente = 0;

      sesiones.forEach((sesion) => {
        const clave = claveSesion(sesion.fecha, sesion.hora_inicio);
        const asistencia = asistenciasPorAlumnoSesion.get(`${alumno.id}|${clave}`);
        const estado = asistencia?.estado || 'Pendiente';

        detalle[clave] = estado;

        if (estado === 'Presente') presente += 1;
        else if (estado === 'Tarde') tarde += 1;
        else if (estado === 'Ausente') ausente += 1;
        else if (estado === 'Justificado') justificado += 1;
        else pendiente += 1;
      });

      const totalSesiones = sesiones.length;
      const asistenciasValidas = presente + tarde + justificado;
      const porcentajeAsistencia =
        totalSesiones > 0
          ? Math.round((asistenciasValidas / totalSesiones) * 1000) / 10
          : 0;

      return {
        id: alumno.id,
        nombre: alumno.nombre,
        correo: alumno.correo || '',
        totalSesiones,
        presente,
        tarde,
        ausente,
        justificado,
        pendiente,
        porcentajeAsistencia,
        detalle,
      };
    });

    const totalRegistrosEsperados = estudiantes.length * sesiones.length;

    const totalAsistenciasValidas = estudiantes.reduce(
      (total, estudiante) =>
        total + estudiante.presente + estudiante.tarde + estudiante.justificado,
      0
    );

    const totalAusencias = estudiantes.reduce(
      (total, estudiante) => total + estudiante.ausente,
      0
    );

    const porcentajeGeneral =
      totalRegistrosEsperados > 0
        ? Math.round((totalAsistenciasValidas / totalRegistrosEsperados) * 1000) /
          10
        : 0;

    setSesionesReporte(sesiones);
    setEstudiantesReporte(estudiantes);
    setResumen({
      porcentajeGeneral,
      totalSesiones: sesiones.length,
      totalEstudiantes: estudiantes.length,
      totalAusencias,
    });

    setConsultando(false);

    if (mostrarMensaje) {
      if (sesiones.length === 0) {
        setMensaje('No hay sesiones registradas en el rango seleccionado.');
      } else {
        setMensaje('Reporte generado correctamente.');
      }
    }
  }

  function exportarCSV() {
    if (!materiaSeleccionada || estudiantesReporte.length === 0) {
      setError('Primero genera un reporte con estudiantes.');
      return;
    }

    const columnasSesiones = sesionesReporte.map((sesion) => ({
      clave: claveSesion(sesion.fecha, sesion.hora_inicio),
      titulo: `${sesion.fecha} ${mostrarHora(sesion.hora_inicio)}`,
    }));

    const encabezados = [
      'Código estudiante',
      'Nombre estudiante',
      'Correo',
      'Porcentaje de asistencia',
      'Presente',
      'Tarde',
      'Ausente',
      'Justificado',
      'Pendiente',
      'Total de sesiones',
      ...columnasSesiones.map((sesion) => sesion.titulo),
    ];

    const filas = estudiantesReporte.map((estudiante) => [
      estudiante.id,
      estudiante.nombre,
      estudiante.correo,
      `${estudiante.porcentajeAsistencia}%`,
      estudiante.presente,
      estudiante.tarde,
      estudiante.ausente,
      estudiante.justificado,
      estudiante.pendiente,
      estudiante.totalSesiones,
      ...columnasSesiones.map((sesion) => estudiante.detalle[sesion.clave] || ''),
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
    link.download = `reporte-${materiaSeleccionada.codigo}-${fechaDesde}-${fechaHasta}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  function cambiarMateria(materiaId: string) {
    setMateriaSeleccionadaId(materiaId);
    setMensaje('');
    setError('');
    setEstudiantesReporte([]);
    setSesionesReporte([]);
    setResumen({
      porcentajeGeneral: 0,
      totalSesiones: 0,
      totalEstudiantes: 0,
      totalAusencias: 0,
    });
  }

  function volver() {
    if (rol === 'Profesor') {
      window.location.href = '/inicio';
      return;
    }

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
          <h1>Reporte por materia</h1>
          <p>{rol}</p>
        </section>

        {error && <div className="error-message">{error}</div>}
        {mensaje && <div className="success-message">{mensaje}</div>}

        <section className="content-card">
          <form className="form" onSubmit={(e) => consultarReporte(e)}>
            <label className="field">
              <span>Materia</span>

              <select
                value={materiaSeleccionadaId}
                onChange={(e) => cambiarMateria(e.target.value)}
                disabled={cargando}
              >
                <option value="">Seleccionar materia</option>

                {materias.map((materia) => (
                  <option key={materia.id} value={materia.id}>
                    {materia.nombre} · {materia.periodo_id}
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
            <strong>{resumen.porcentajeGeneral}%</strong>
          </article>

          <article>
            <span>Sesiones</span>
            <strong>{resumen.totalSesiones}</strong>
          </article>

          <article>
            <span>Estudiantes</span>
            <strong>{resumen.totalEstudiantes}</strong>
          </article>

          <article>
            <span>Ausencias</span>
            <strong>{resumen.totalAusencias}</strong>
          </article>
        </section>

        <section className="content-card">
          <div className="section-header">
            <p className="section-label">Estudiantes</p>

            <button className="export-button" onClick={exportarCSV}>
              Exportar
            </button>
          </div>

          <input
            className="search-input"
            type="text"
            value={busqueda}
            placeholder="Buscar estudiante"
            onChange={(e) => setBusqueda(e.target.value)}
          />

          <div className="sort-row">
            <button
              className={orden === 'nombre' ? 'active' : ''}
              onClick={() => setOrden('nombre')}
            >
              Nombre
            </button>

            <button
              className={orden === 'apellido' ? 'active' : ''}
              onClick={() => setOrden('apellido')}
            >
              Apellido
            </button>

            <button
              className={orden === 'asistencia' ? 'active' : ''}
              onClick={() => setOrden('asistencia')}
            >
              Asistencia
            </button>
          </div>

          {cargando && <p className="empty-text">Cargando reporte...</p>}

          {!cargando && !consultando && estudiantesFiltrados.length === 0 && (
            <p className="empty-text">No hay estudiantes para mostrar.</p>
          )}

          <div className="student-list">
            {estudiantesFiltrados.map((estudiante) => (
              <article key={estudiante.id} className="student-row">
                <div className="student-main">
                  <div className="student-name">
                    <strong>{estudiante.nombre}</strong>
                    <span>{estudiante.id}</span>
                  </div>

                  <div className="percentage">
                    {estudiante.porcentajeAsistencia}%
                  </div>
                </div>

                <div className="mini-stats">
                  <span>P {estudiante.presente}</span>
                  <span>T {estudiante.tarde}</span>
                  <span>A {estudiante.ausente}</span>
                  <span>J {estudiante.justificado}</span>
                  <span>Pend. {estudiante.pendiente}</span>
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

  .sort-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 7px;
    margin-top: 12px;
  }

  .sort-row button {
    min-height: 36px;
    border: none;
    border-radius: 999px;
    background: #eeeeee;
    color: #111111;
    font-size: 11px;
    font-weight: 900;
    cursor: pointer;
  }

  .sort-row button.active {
    background: #111111;
    color: #ffffff;
  }

  .student-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 14px;
  }

  .student-row {
    border: 1px solid #e5e7eb;
    border-radius: 15px;
    background: #fafafa;
    padding: 10px;
  }

  .student-main {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 10px;
    align-items: center;
  }

  .student-name {
    min-width: 0;
  }

  .student-name strong {
    display: block;
    font-size: 13px;
    line-height: 1.15;
    font-weight: 900;
    color: #111111;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .student-name span {
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