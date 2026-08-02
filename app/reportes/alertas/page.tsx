'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
};

type AlertaAsistencia = {
  alumno_id: string;
  alumno_nombre: string;
  alumno_correo: string;
  materia_id: string;
  materia_nombre: string;
  porcentaje: number;
  totalSesiones: number;
  presente: number;
  tarde: number;
  ausente: number;
  justificado: number;
  pendiente: number;
};

type AlertaDia = {
  alumno_id: string;
  alumno_nombre: string;
  alumno_correo: string;
  materia_id: string;
  materia_nombre: string;
  fecha: string;
  totalSesionesDia: number;
  ausente: number;
  pendiente: number;
};

type ResumenAlertas = {
  bajaAsistencia: number;
  ausenciasRepetidas: number;
  sinAsistenciaDia: number;
  materiasConsultadas: number;
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

function claveAsistencia(
  materiaId: string,
  fecha: string,
  hora: string,
  alumnoId: string
) {
  return `${materiaId}|${fecha}|${hora}|${alumnoId}`;
}

function escaparCSV(valor: string | number) {
  const texto = String(valor ?? '');
  return `"${texto.replace(/"/g, '""')}"`;
}

export default function AlertasPage() {
  const consultaInicialGenerada = useRef(false);

  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [rol, setRol] = useState<RolUsuario>('Profesor');

  const [materiasPermitidas, setMateriasPermitidas] = useState<Materia[]>([]);
  const [materiaFiltroId, setMateriaFiltroId] = useState('');

  const [fechaDesde, setFechaDesde] = useState(primerDiaMesISO());
  const [fechaHasta, setFechaHasta] = useState(fechaLocalISO());
  const [fechaDia, setFechaDia] = useState(fechaLocalISO());

  const [umbralAsistencia, setUmbralAsistencia] = useState(75);
  const [minimoAusencias, setMinimoAusencias] = useState(3);

  const [alertasBajaAsistencia, setAlertasBajaAsistencia] = useState<
    AlertaAsistencia[]
  >([]);
  const [alertasAusencias, setAlertasAusencias] = useState<AlertaAsistencia[]>(
    []
  );
  const [alertasDia, setAlertasDia] = useState<AlertaDia[]>([]);

  const [resumen, setResumen] = useState<ResumenAlertas>({
    bajaAsistencia: 0,
    ausenciasRepetidas: 0,
    sinAsistenciaDia: 0,
    materiasConsultadas: 0,
  });

  const [busqueda, setBusqueda] = useState('');

  const [cargando, setCargando] = useState(true);
  const [consultando, setConsultando] = useState(false);

  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    cargarPagina();
  }, []);

  useEffect(() => {
    if (
      !cargando &&
      materiasPermitidas.length > 0 &&
      !consultaInicialGenerada.current
    ) {
      consultaInicialGenerada.current = true;
      consultarAlertas(undefined, false);
    }
  }, [cargando, materiasPermitidas]);

  const materiasPorId = useMemo(() => {
    const mapa = new Map<string, Materia>();

    materiasPermitidas.forEach((materia) => {
      mapa.set(materia.id, materia);
    });

    return mapa;
  }, [materiasPermitidas]);

  const materiasConsulta = useMemo(() => {
    if (!materiaFiltroId) return materiasPermitidas;

    return materiasPermitidas.filter((materia) => materia.id === materiaFiltroId);
  }, [materiasPermitidas, materiaFiltroId]);

  const alertasBajaFiltradas = useMemo(() => {
    const texto = normalizarTexto(busqueda);

    return alertasBajaAsistencia.filter((alerta) => {
      if (!texto) return true;

      return (
        normalizarTexto(alerta.alumno_nombre).includes(texto) ||
        normalizarTexto(alerta.alumno_id).includes(texto) ||
        normalizarTexto(alerta.materia_nombre).includes(texto)
      );
    });
  }, [alertasBajaAsistencia, busqueda]);

  const alertasAusenciasFiltradas = useMemo(() => {
    const texto = normalizarTexto(busqueda);

    return alertasAusencias.filter((alerta) => {
      if (!texto) return true;

      return (
        normalizarTexto(alerta.alumno_nombre).includes(texto) ||
        normalizarTexto(alerta.alumno_id).includes(texto) ||
        normalizarTexto(alerta.materia_nombre).includes(texto)
      );
    });
  }, [alertasAusencias, busqueda]);

  const alertasDiaFiltradas = useMemo(() => {
    const texto = normalizarTexto(busqueda);

    return alertasDia.filter((alerta) => {
      if (!texto) return true;

      return (
        normalizarTexto(alerta.alumno_nombre).includes(texto) ||
        normalizarTexto(alerta.alumno_id).includes(texto) ||
        normalizarTexto(alerta.materia_nombre).includes(texto)
      );
    });
  }, [alertasDia, busqueda]);

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

  async function consultarAlertas(
    e?: FormEvent<HTMLFormElement>,
    mostrarMensaje = true
  ) {
    if (e) {
      e.preventDefault();
    }

    setError('');
    setMensaje('');

    const materiaIdsConsulta = materiasConsulta.map((materia) => materia.id);

    if (materiaIdsConsulta.length === 0) {
      setError('No tienes materias disponibles para consultar.');
      return;
    }

    if (!fechaDesde || !fechaHasta || !fechaDia) {
      setError('Completa las fechas del reporte.');
      return;
    }

    if (fechaHasta < fechaDesde) {
      setError('La fecha final no puede ser menor que la fecha inicial.');
      return;
    }

    if (umbralAsistencia < 0 || umbralAsistencia > 100) {
      setError('El umbral de asistencia debe estar entre 0 y 100.');
      return;
    }

    if (minimoAusencias < 1) {
      setError('El mínimo de ausencias debe ser mayor o igual a 1.');
      return;
    }

    setConsultando(true);

    const { data: inscritosData, error: inscritosError } = await supabase
      .from('inscritos')
      .select('materia_id, alumno_id, estado')
      .in('materia_id', materiaIdsConsulta)
      .eq('estado', true);

    if (inscritosError) {
      setConsultando(false);
      setError(`No fue posible cargar inscritos: ${inscritosError.message}`);
      return;
    }

    const inscritos = (inscritosData || []) as Inscrito[];

    if (inscritos.length === 0) {
      limpiarResultados(materiaIdsConsulta.length);
      setConsultando(false);

      if (mostrarMensaje) {
        setMensaje('No hay estudiantes inscritos en las materias consultadas.');
      }

      return;
    }

    const alumnoIds = Array.from(
      new Set(inscritos.map((inscrito) => inscrito.alumno_id))
    );

    const { data: alumnosData, error: alumnosError } = await supabase
      .from('alumnos')
      .select('id, nombre, correo')
      .in('id', alumnoIds)
      .eq('estado', true)
      .order('nombre', { ascending: true });

    if (alumnosError) {
      setConsultando(false);
      setError(`No fue posible cargar estudiantes: ${alumnosError.message}`);
      return;
    }

    const { data: sesionesRangoData, error: sesionesRangoError } = await supabase
      .from('sesiones')
      .select('materia_id, fecha, hora_inicio, estado')
      .in('materia_id', materiaIdsConsulta)
      .gte('fecha', fechaDesde)
      .lte('fecha', fechaHasta)
      .order('fecha', { ascending: true })
      .order('hora_inicio', { ascending: true });

    if (sesionesRangoError) {
      setConsultando(false);
      setError(`No fue posible cargar sesiones: ${sesionesRangoError.message}`);
      return;
    }

    const { data: sesionesDiaData, error: sesionesDiaError } = await supabase
      .from('sesiones')
      .select('materia_id, fecha, hora_inicio, estado')
      .in('materia_id', materiaIdsConsulta)
      .eq('fecha', fechaDia)
      .order('hora_inicio', { ascending: true });

    if (sesionesDiaError) {
      setConsultando(false);
      setError(`No fue posible cargar sesiones del día: ${sesionesDiaError.message}`);
      return;
    }

    const { data: asistenciasRangoData, error: asistenciasRangoError } =
      await supabase
        .from('asistencias')
        .select('materia_id, fecha, hora_inicio, alumno_id, estado')
        .in('materia_id', materiaIdsConsulta)
        .gte('fecha', fechaDesde)
        .lte('fecha', fechaHasta);

    if (asistenciasRangoError) {
      setConsultando(false);
      setError(
        `No fue posible cargar asistencias: ${asistenciasRangoError.message}`
      );
      return;
    }

    const { data: asistenciasDiaData, error: asistenciasDiaError } =
      await supabase
        .from('asistencias')
        .select('materia_id, fecha, hora_inicio, alumno_id, estado')
        .in('materia_id', materiaIdsConsulta)
        .eq('fecha', fechaDia);

    if (asistenciasDiaError) {
      setConsultando(false);
      setError(
        `No fue posible cargar asistencias del día: ${asistenciasDiaError.message}`
      );
      return;
    }

    const alumnos = (alumnosData || []) as Alumno[];
    const alumnosPorId = new Map(alumnos.map((alumno) => [alumno.id, alumno]));

    const sesionesRango = ((sesionesRangoData || []) as Sesion[]).filter(
      (sesion) => sesion.estado !== 'Cancelada'
    );

    const sesionesDia = ((sesionesDiaData || []) as Sesion[]).filter(
      (sesion) => sesion.estado !== 'Cancelada'
    );

    const asistenciasRango = (asistenciasRangoData || []) as Asistencia[];
    const asistenciasDia = (asistenciasDiaData || []) as Asistencia[];

    const asistenciasRangoMapa = new Map<string, Asistencia>();

    asistenciasRango.forEach((asistencia) => {
      asistenciasRangoMapa.set(
        claveAsistencia(
          asistencia.materia_id,
          asistencia.fecha,
          asistencia.hora_inicio,
          asistencia.alumno_id
        ),
        asistencia
      );
    });

    const asistenciasDiaMapa = new Map<string, Asistencia>();

    asistenciasDia.forEach((asistencia) => {
      asistenciasDiaMapa.set(
        claveAsistencia(
          asistencia.materia_id,
          asistencia.fecha,
          asistencia.hora_inicio,
          asistencia.alumno_id
        ),
        asistencia
      );
    });

    const inscritosPorMateria = new Map<string, Inscrito[]>();

    inscritos.forEach((inscrito) => {
      if (!inscritosPorMateria.has(inscrito.materia_id)) {
        inscritosPorMateria.set(inscrito.materia_id, []);
      }

      inscritosPorMateria.get(inscrito.materia_id)?.push(inscrito);
    });

    const sesionesPorMateria = new Map<string, Sesion[]>();

    sesionesRango.forEach((sesion) => {
      if (!sesionesPorMateria.has(sesion.materia_id)) {
        sesionesPorMateria.set(sesion.materia_id, []);
      }

      sesionesPorMateria.get(sesion.materia_id)?.push(sesion);
    });

    const sesionesDiaPorMateria = new Map<string, Sesion[]>();

    sesionesDia.forEach((sesion) => {
      if (!sesionesDiaPorMateria.has(sesion.materia_id)) {
        sesionesDiaPorMateria.set(sesion.materia_id, []);
      }

      sesionesDiaPorMateria.get(sesion.materia_id)?.push(sesion);
    });

    const bajaAsistencia: AlertaAsistencia[] = [];
    const ausenciasRepetidas: AlertaAsistencia[] = [];
    const sinAsistenciaDia: AlertaDia[] = [];

    materiaIdsConsulta.forEach((materiaId) => {
      const materia = materiasPorId.get(materiaId);
      const inscritosMateria = inscritosPorMateria.get(materiaId) || [];
      const sesionesMateria = sesionesPorMateria.get(materiaId) || [];
      const sesionesMateriaDia = sesionesDiaPorMateria.get(materiaId) || [];

      inscritosMateria.forEach((inscrito) => {
        const alumno = alumnosPorId.get(inscrito.alumno_id);

        if (!alumno) return;

        let presente = 0;
        let tarde = 0;
        let ausente = 0;
        let justificado = 0;
        let pendiente = 0;

        sesionesMateria.forEach((sesion) => {
          const asistencia = asistenciasRangoMapa.get(
            claveAsistencia(
              materiaId,
              sesion.fecha,
              sesion.hora_inicio,
              alumno.id
            )
          );

          const estado = asistencia?.estado || 'Pendiente';

          if (estado === 'Presente') presente += 1;
          else if (estado === 'Tarde') tarde += 1;
          else if (estado === 'Ausente') ausente += 1;
          else if (estado === 'Justificado') justificado += 1;
          else pendiente += 1;
        });

        const totalSesiones = sesionesMateria.length;
        const asistenciasValidas = presente + tarde + justificado;
        const porcentaje =
          totalSesiones > 0
            ? Math.round((asistenciasValidas / totalSesiones) * 1000) / 10
            : 0;

        const alertaBase: AlertaAsistencia = {
          alumno_id: alumno.id,
          alumno_nombre: alumno.nombre,
          alumno_correo: alumno.correo || '',
          materia_id: materiaId,
          materia_nombre: materia?.nombre || materiaId,
          porcentaje,
          totalSesiones,
          presente,
          tarde,
          ausente,
          justificado,
          pendiente,
        };

        if (totalSesiones > 0 && porcentaje < umbralAsistencia) {
          bajaAsistencia.push(alertaBase);
        }

        if (ausente >= minimoAusencias) {
          ausenciasRepetidas.push(alertaBase);
        }

        if (sesionesMateriaDia.length > 0) {
          let validasDia = 0;
          let ausentesDia = 0;
          let pendientesDia = 0;

          sesionesMateriaDia.forEach((sesion) => {
            const asistencia = asistenciasDiaMapa.get(
              claveAsistencia(
                materiaId,
                sesion.fecha,
                sesion.hora_inicio,
                alumno.id
              )
            );

            const estado = asistencia?.estado || 'Pendiente';

            if (
              estado === 'Presente' ||
              estado === 'Tarde' ||
              estado === 'Justificado'
            ) {
              validasDia += 1;
            } else if (estado === 'Ausente') {
              ausentesDia += 1;
            } else {
              pendientesDia += 1;
            }
          });

          if (validasDia === 0) {
            sinAsistenciaDia.push({
              alumno_id: alumno.id,
              alumno_nombre: alumno.nombre,
              alumno_correo: alumno.correo || '',
              materia_id: materiaId,
              materia_nombre: materia?.nombre || materiaId,
              fecha: fechaDia,
              totalSesionesDia: sesionesMateriaDia.length,
              ausente: ausentesDia,
              pendiente: pendientesDia,
            });
          }
        }
      });
    });

    bajaAsistencia.sort(
      (a, b) =>
        a.porcentaje - b.porcentaje ||
        b.ausente - a.ausente ||
        a.alumno_nombre.localeCompare(b.alumno_nombre)
    );

    ausenciasRepetidas.sort(
      (a, b) =>
        b.ausente - a.ausente ||
        a.porcentaje - b.porcentaje ||
        a.alumno_nombre.localeCompare(b.alumno_nombre)
    );

    sinAsistenciaDia.sort(
      (a, b) =>
        a.materia_nombre.localeCompare(b.materia_nombre) ||
        a.alumno_nombre.localeCompare(b.alumno_nombre)
    );

    setAlertasBajaAsistencia(bajaAsistencia);
    setAlertasAusencias(ausenciasRepetidas);
    setAlertasDia(sinAsistenciaDia);

    setResumen({
      bajaAsistencia: bajaAsistencia.length,
      ausenciasRepetidas: ausenciasRepetidas.length,
      sinAsistenciaDia: sinAsistenciaDia.length,
      materiasConsultadas: materiaIdsConsulta.length,
    });

    setConsultando(false);

    if (mostrarMensaje) {
      setMensaje('Alertas generadas correctamente.');
    }
  }

  function limpiarResultados(materiasConsultadas = 0) {
    setAlertasBajaAsistencia([]);
    setAlertasAusencias([]);
    setAlertasDia([]);

    setResumen({
      bajaAsistencia: 0,
      ausenciasRepetidas: 0,
      sinAsistenciaDia: 0,
      materiasConsultadas,
    });
  }

  function exportarCSV() {
    const total =
      alertasBajaAsistencia.length + alertasAusencias.length + alertasDia.length;

    if (total === 0) {
      setError('Primero genera alertas para exportar.');
      return;
    }

    const encabezados = [
      'Tipo alerta',
      'Código estudiante',
      'Nombre estudiante',
      'Correo',
      'Materia',
      'Porcentaje',
      'Sesiones',
      'Presente',
      'Tarde',
      'Ausente',
      'Justificado',
      'Pendiente',
      'Fecha día',
    ];

    const filasBaja = alertasBajaAsistencia.map((alerta) => [
      'Baja asistencia',
      alerta.alumno_id,
      alerta.alumno_nombre,
      alerta.alumno_correo,
      alerta.materia_nombre,
      `${alerta.porcentaje}%`,
      alerta.totalSesiones,
      alerta.presente,
      alerta.tarde,
      alerta.ausente,
      alerta.justificado,
      alerta.pendiente,
      '',
    ]);

    const filasAusencias = alertasAusencias.map((alerta) => [
      'Ausencias repetidas',
      alerta.alumno_id,
      alerta.alumno_nombre,
      alerta.alumno_correo,
      alerta.materia_nombre,
      `${alerta.porcentaje}%`,
      alerta.totalSesiones,
      alerta.presente,
      alerta.tarde,
      alerta.ausente,
      alerta.justificado,
      alerta.pendiente,
      '',
    ]);

    const filasDia = alertasDia.map((alerta) => [
      'Sin asistencia en el día',
      alerta.alumno_id,
      alerta.alumno_nombre,
      alerta.alumno_correo,
      alerta.materia_nombre,
      '',
      alerta.totalSesionesDia,
      '',
      '',
      alerta.ausente,
      '',
      alerta.pendiente,
      alerta.fecha,
    ]);

    const contenido = [encabezados, ...filasBaja, ...filasAusencias, ...filasDia]
      .map((fila) => fila.map(escaparCSV).join(';'))
      .join('\n');

    const blob = new Blob([`\uFEFF${contenido}`], {
      type: 'text/csv;charset=utf-8;',
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `alertas-asistencia-${fechaDesde}-${fechaHasta}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  function cambiarMateriaFiltro(materiaId: string) {
    setMateriaFiltroId(materiaId);
    limpiarResultados();
    setMensaje('');
    setError('');
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
          <h1>Alertas</h1>
          <p>{rol}</p>
        </section>

        {error && <div className="error-message">{error}</div>}
        {mensaje && <div className="success-message">{mensaje}</div>}

        <section className="content-card">
          <form className="form" onSubmit={consultarAlertas}>
            <label className="field">
              <span>Materia</span>

              <select
                value={materiaFiltroId}
                onChange={(e) => cambiarMateriaFiltro(e.target.value)}
                disabled={cargando}
              >
                <option value="">Todas las materias permitidas</option>

                {materiasPermitidas.map((materia) => (
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

            <div className="three-grid">
              <label className="field">
                <span>Día</span>

                <input
                  type="date"
                  value={fechaDia}
                  onChange={(e) => setFechaDia(e.target.value)}
                />
              </label>

              <label className="field">
                <span>% mínimo</span>

                <input
                  type="number"
                  min="0"
                  max="100"
                  value={umbralAsistencia}
                  onChange={(e) => setUmbralAsistencia(Number(e.target.value))}
                />
              </label>

              <label className="field">
                <span>Ausencias</span>

                <input
                  type="number"
                  min="1"
                  value={minimoAusencias}
                  onChange={(e) => setMinimoAusencias(Number(e.target.value))}
                />
              </label>
            </div>

            <button
              type="submit"
              className="primary-button"
              disabled={consultando || cargando}
            >
              {consultando ? 'Consultando...' : 'Consultar alertas'}
            </button>
          </form>
        </section>

        <section className="summary-grid">
          <article>
            <span>Baja asist.</span>
            <strong>{resumen.bajaAsistencia}</strong>
          </article>

          <article>
            <span>Ausencias</span>
            <strong>{resumen.ausenciasRepetidas}</strong>
          </article>

          <article>
            <span>Día</span>
            <strong>{resumen.sinAsistenciaDia}</strong>
          </article>

          <article>
            <span>Materias</span>
            <strong>{resumen.materiasConsultadas}</strong>
          </article>
        </section>

        <section className="content-card">
          <div className="section-header">
            <p className="section-label">Buscar</p>

            <button className="export-button" onClick={exportarCSV}>
              Exportar
            </button>
          </div>

          <input
            className="search-input"
            type="text"
            value={busqueda}
            placeholder="Buscar estudiante o materia"
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </section>

        <section className="content-card">
          <div className="section-header">
            <p className="section-label">
              Baja asistencia menor a {umbralAsistencia}%
            </p>
          </div>

          {cargando && <p className="empty-text">Cargando alertas...</p>}

          {!cargando && alertasBajaFiltradas.length === 0 && (
            <p className="empty-text">No hay alertas de baja asistencia.</p>
          )}

          <div className="alert-list">
            {alertasBajaFiltradas.map((alerta) => (
              <article
                key={`baja-${alerta.materia_id}-${alerta.alumno_id}`}
                className="alert-row"
              >
                <div className="alert-main">
                  <strong>{alerta.alumno_nombre}</strong>
                  <span>
                    {alerta.alumno_id} · {alerta.materia_nombre}
                  </span>
                </div>

                <div className="percentage danger">{alerta.porcentaje}%</div>

                <div className="mini-stats">
                  <span>P {alerta.presente}</span>
                  <span>T {alerta.tarde}</span>
                  <span>A {alerta.ausente}</span>
                  <span>J {alerta.justificado}</span>
                  <span>Pend. {alerta.pendiente}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="content-card">
          <div className="section-header">
            <p className="section-label">
              Ausencias repetidas desde {minimoAusencias}
            </p>
          </div>

          {!cargando && alertasAusenciasFiltradas.length === 0 && (
            <p className="empty-text">No hay alertas de ausencias repetidas.</p>
          )}

          <div className="alert-list">
            {alertasAusenciasFiltradas.map((alerta) => (
              <article
                key={`ausencia-${alerta.materia_id}-${alerta.alumno_id}`}
                className="alert-row"
              >
                <div className="alert-main">
                  <strong>{alerta.alumno_nombre}</strong>
                  <span>
                    {alerta.alumno_id} · {alerta.materia_nombre}
                  </span>
                </div>

                <div className="percentage danger">{alerta.ausente}</div>

                <div className="mini-stats">
                  <span>{alerta.porcentaje}%</span>
                  <span>P {alerta.presente}</span>
                  <span>T {alerta.tarde}</span>
                  <span>J {alerta.justificado}</span>
                  <span>Pend. {alerta.pendiente}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="content-card">
          <div className="section-header">
            <p className="section-label">
              Sin asistencia el {formatearFecha(fechaDia)}
            </p>
          </div>

          {!cargando && alertasDiaFiltradas.length === 0 && (
            <p className="empty-text">No hay alertas para el día seleccionado.</p>
          )}

          <div className="alert-list">
            {alertasDiaFiltradas.map((alerta) => (
              <article
                key={`dia-${alerta.materia_id}-${alerta.alumno_id}`}
                className="alert-row simple"
              >
                <div className="alert-main">
                  <strong>{alerta.alumno_nombre}</strong>
                  <span>
                    {alerta.alumno_id} · {alerta.materia_nombre}
                  </span>
                </div>

                <div className="percentage danger">
                  {alerta.totalSesionesDia}
                </div>

                <div className="mini-stats">
                  <span>Aus. {alerta.ausente}</span>
                  <span>Pend. {alerta.pendiente}</span>
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

  .three-grid {
    display: grid;
    grid-template-columns: 1.3fr 0.8fr 0.8fr;
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

  .alert-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .alert-row {
    border: 1px solid #e5e7eb;
    border-radius: 15px;
    background: #fafafa;
    padding: 10px;
  }

  .alert-row.simple {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 10px;
    align-items: center;
  }

  .alert-main {
    min-width: 0;
  }

  .alert-main strong {
    display: block;
    color: #111111;
    font-size: 13px;
    line-height: 1.2;
    font-weight: 900;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .alert-main span {
    display: block;
    margin-top: 3px;
    color: #666666;
    font-size: 10px;
    font-weight: 800;
    line-height: 1.35;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .percentage {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 54px;
    border-radius: 999px;
    background: #111111;
    color: #ffffff;
    padding: 7px 8px;
    font-size: 12px;
    font-weight: 900;
    text-align: center;
    margin-top: 8px;
  }

  .percentage.danger {
    background: #991b1b;
    color: #ffffff;
  }

  .mini-stats {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 5px;
    margin-top: 8px;
  }

  .alert-row.simple .mini-stats {
    grid-column: 1 / -1;
    grid-template-columns: repeat(2, 1fr);
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

    .two-grid,
    .three-grid {
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