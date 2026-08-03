'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type RolUsuario = 'Administrador' | 'Coordinador' | 'Profesor';

type EstadoAsistencia =
  | 'Presente'
  | 'Tarde'
  | 'Ausente'
  | 'Justificado'
  | 'Pendiente';

type MetodoAsistencia = 'QR' | 'Manual';

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

type Asistencia = {
  materia_id: string;
  fecha: string;
  hora_inicio: string;
  alumno_id: string;
  estado: EstadoAsistencia;
  metodo: string;
  fecha_hora_registro: string | null;
};

type AlumnoVista = Alumno & {
  asistencia_estado: EstadoAsistencia;
  asistencia_metodo: string;
  fecha_hora_registro: string | null;
};

type OrdenListado = 'nombre' | 'apellido' | 'asistencia';

function normalizarHora(hora: string) {
  const limpia = hora.trim();

  if (!limpia) return '';

  if (/^\d{2}:\d{2}$/.test(limpia)) {
    return `${limpia}:00`;
  }

  return limpia;
}

function mostrarHora(hora: string) {
  if (!hora) return '';
  return hora.slice(0, 5);
}

function formatearFecha(fecha: string) {
  if (!fecha) return '';

  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${fecha}T00:00:00`));
}

function normalizarTexto(texto: string | null | undefined) {
  return String(texto || '').trim().toLowerCase();
}

function obtenerApellido(nombre: string) {
  const partes = nombre.trim().split(/\s+/);
  return partes[partes.length - 1] || nombre;
}

function claseEstado(estado: EstadoAsistencia) {
  return `status ${estado.toLowerCase()}`;
}

function claseFilaEstado(estado: EstadoAsistencia) {
  return `student-row student-row-${estado.toLowerCase()}`;
}

function textoMetodo(alumno: AlumnoVista) {
  if (alumno.asistencia_estado === 'Pendiente') {
    return 'Sin registrar';
  }

  if (alumno.asistencia_metodo === 'QR') {
    return 'Registrado por QR';
  }

  if (alumno.asistencia_metodo === 'Manual') {
    return 'Registrado manualmente';
  }

  return 'Registrado';
}

export default function AsistenciaPage() {
  return (
    <Suspense fallback={<CargandoAsistencia />}>
      <AsistenciaContent />
    </Suspense>
  );
}

function CargandoAsistencia() {
  return (
    <main className="page">
      <section className="shell">
        <section className="loading-card">
          <div className="brand-mark">ECI</div>
          <h1>Asistencia</h1>
          <p>Cargando...</p>
        </section>
      </section>

      <style>{estilos}</style>
    </main>
  );
}

function AsistenciaContent() {
  const searchParams = useSearchParams();

  const materiaId = searchParams.get('materia') || '';
  const fecha = searchParams.get('fecha') || '';
  const hora = normalizarHora(searchParams.get('hora') || '');

  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [rol, setRol] = useState<RolUsuario>('Profesor');

  const [materia, setMateria] = useState<Materia | null>(null);
  const [sesion, setSesion] = useState<Sesion | null>(null);

  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [asistencias, setAsistencias] = useState<Asistencia[]>([]);

  const [codigoLeido, setCodigoLeido] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [orden, setOrden] = useState<OrdenListado>('apellido');

  const [cargando, setCargando] = useState(true);
  const [registrando, setRegistrando] = useState(false);

  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    cargarPagina();
  }, []);

  const asistenciasPorAlumno = useMemo(() => {
    const mapa = new Map<string, Asistencia>();

    asistencias.forEach((asistencia) => {
      mapa.set(asistencia.alumno_id, asistencia);
    });

    return mapa;
  }, [asistencias]);

  const alumnosVista = useMemo<AlumnoVista[]>(() => {
    return alumnos.map((alumno) => {
      const asistencia = asistenciasPorAlumno.get(alumno.id);

      return {
        ...alumno,
        asistencia_estado: asistencia?.estado || 'Pendiente',
        asistencia_metodo: asistencia?.metodo || '',
        fecha_hora_registro: asistencia?.fecha_hora_registro || null,
      };
    });
  }, [alumnos, asistenciasPorAlumno]);

  const resumen = useMemo(() => {
    return {
      presente: alumnosVista.filter(
        (alumno) => alumno.asistencia_estado === 'Presente'
      ).length,
      tarde: alumnosVista.filter((alumno) => alumno.asistencia_estado === 'Tarde')
        .length,
      ausente: alumnosVista.filter(
        (alumno) => alumno.asistencia_estado === 'Ausente'
      ).length,
      justificado: alumnosVista.filter(
        (alumno) => alumno.asistencia_estado === 'Justificado'
      ).length,
      pendiente: alumnosVista.filter(
        (alumno) => alumno.asistencia_estado === 'Pendiente'
      ).length,
    };
  }, [alumnosVista]);

  const alumnosFiltrados = useMemo(() => {
    const texto = normalizarTexto(busqueda);

    const prioridadEstado: Record<EstadoAsistencia, number> = {
      Pendiente: 0,
      Ausente: 1,
      Tarde: 2,
      Presente: 3,
      Justificado: 4,
    };

    return alumnosVista
      .filter((alumno) => {
        if (!texto) return true;

        return (
          normalizarTexto(alumno.nombre).includes(texto) ||
          normalizarTexto(alumno.id).includes(texto) ||
          normalizarTexto(alumno.correo).includes(texto)
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
          prioridadEstado[a.asistencia_estado] -
            prioridadEstado[b.asistencia_estado] ||
          a.nombre.localeCompare(b.nombre)
        );
      });
  }, [alumnosVista, busqueda, orden]);

  async function cargarPagina() {
    setCargando(true);
    setError('');
    setMensaje('');

    if (!materiaId || !fecha || !hora) {
      setError('Faltan datos de la materia, fecha u hora de la sesión.');
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

    const puedeRegistrar =
      rolDetectado === 'Administrador' || materiaData.profesor_id === usuarioData.id;

    if (!puedeRegistrar) {
      setError('No tienes permiso para registrar asistencia en esta materia.');
      setCargando(false);
      return;
    }

    setMateria(materiaData);

    const { data: sesionData, error: sesionError } = await supabase
      .from('sesiones')
      .select('materia_id, fecha, hora_inicio, estado, tolerancia_minutos')
      .eq('materia_id', materiaId)
      .eq('fecha', fecha)
      .eq('hora_inicio', hora)
      .neq('estado', 'Cancelada')
      .maybeSingle();

    if (sesionError) {
      setError(`No fue posible cargar la sesión: ${sesionError.message}`);
      setCargando(false);
      return;
    }

    if (!sesionData) {
      setError('La sesión no existe o fue cancelada.');
      setCargando(false);
      return;
    }

    setSesion(sesionData);

    await cargarDatosAsistencia();

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

  async function cargarDatosAsistencia() {
    const { data: inscritosData, error: inscritosError } = await supabase
      .from('inscritos')
      .select('materia_id, alumno_id, estado')
      .eq('materia_id', materiaId)
      .eq('estado', true);

    if (inscritosError) {
      setError(`No fue posible cargar inscritos: ${inscritosError.message}`);
      return;
    }

    const inscritos = (inscritosData || []) as Inscrito[];
    const alumnoIds = inscritos.map((inscrito) => inscrito.alumno_id);

    if (alumnoIds.length === 0) {
      setAlumnos([]);
      setAsistencias([]);
      return;
    }

    const { data: alumnosData, error: alumnosError } = await supabase
      .from('alumnos')
      .select('id, nombre, correo, codigo_qr, estado')
      .in('id', alumnoIds)
      .eq('estado', true)
      .order('nombre', { ascending: true });

    if (alumnosError) {
      setError(`No fue posible cargar estudiantes: ${alumnosError.message}`);
      return;
    }

    const { data: asistenciasData, error: asistenciasError } = await supabase
      .from('asistencias')
      .select(
        'materia_id, fecha, hora_inicio, alumno_id, estado, metodo, fecha_hora_registro'
      )
      .eq('materia_id', materiaId)
      .eq('fecha', fecha)
      .eq('hora_inicio', hora);

    if (asistenciasError) {
      setError(`No fue posible cargar asistencias: ${asistenciasError.message}`);
      return;
    }

    setAlumnos((alumnosData || []) as Alumno[]);
    setAsistencias((asistenciasData || []) as Asistencia[]);
  }

  function calcularEstadoAutomatico(): EstadoAsistencia {
    if (!sesion) return 'Presente';

    const horaBase = mostrarHora(sesion.hora_inicio);
    const inicio = new Date(`${sesion.fecha}T${horaBase}:00`);
    const limite = new Date(
      inicio.getTime() + sesion.tolerancia_minutos * 60 * 1000
    );

    return new Date() > limite ? 'Tarde' : 'Presente';
  }

  async function registrarPorCodigo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError('');
    setMensaje('');

    const codigo = codigoLeido.trim();

    if (!codigo) {
      setError('Escanea o escribe el código del estudiante.');
      return;
    }

    const alumno = alumnos.find((item) => {
      return (
        normalizarTexto(item.codigo_qr) === normalizarTexto(codigo) ||
        normalizarTexto(item.id) === normalizarTexto(codigo)
      );
    });

    if (!alumno) {
      setError('El código no corresponde a un estudiante inscrito en esta materia.');
      return;
    }

    await registrarAsistencia(alumno, calcularEstadoAutomatico(), 'QR');
    setCodigoLeido('');
  }

  async function registrarAsistenciaCompleta() {
    if (!materia || !sesion) {
      setError('No hay sesión activa para registrar asistencia.');
      return;
    }

    setError('');
    setMensaje('');

    const pendientes = alumnosVista.filter(
      (alumno) => alumno.asistencia_estado === 'Pendiente'
    );

    if (pendientes.length === 0) {
      setMensaje('No hay estudiantes pendientes por registrar.');
      return;
    }

    const fechaHoraRegistro = new Date().toISOString();

    const registros = pendientes.map((alumno) => ({
      materia_id: materia.id,
      fecha: sesion.fecha,
      hora_inicio: sesion.hora_inicio,
      alumno_id: alumno.id,
      estado: 'Presente',
      metodo: 'Manual',
      fecha_hora_registro: fechaHoraRegistro,
    }));

    setRegistrando(true);

    const { error: upsertError } = await supabase.from('asistencias').upsert(
      registros,
      {
        onConflict: 'materia_id,fecha,hora_inicio,alumno_id',
      }
    );

    if (upsertError) {
      setRegistrando(false);
      setError(
        `No fue posible registrar la asistencia completa: ${upsertError.message}`
      );
      return;
    }

    const alumnoIds = pendientes.map((alumno) => alumno.id);

    const { error: updateError } = await supabase
      .from('asistencias')
      .update({
        estado: 'Presente',
        metodo: 'Manual',
        fecha_hora_registro: fechaHoraRegistro,
      })
      .eq('materia_id', materia.id)
      .eq('fecha', sesion.fecha)
      .eq('hora_inicio', sesion.hora_inicio)
      .in('alumno_id', alumnoIds);

    if (updateError) {
      setRegistrando(false);
      setError(
        `No fue posible confirmar la asistencia completa: ${updateError.message}`
      );
      return;
    }

    await cargarDatosAsistencia();

    setRegistrando(false);
    setMensaje(
      `Asistencia completa registrada para ${pendientes.length} estudiante${
        pendientes.length === 1 ? '' : 's'
      }.`
    );
  }

  async function registrarAsistencia(
    alumno: Alumno,
    estado: EstadoAsistencia,
    metodo: MetodoAsistencia
  ) {
    if (!materia || !sesion) {
      setError('No hay sesión activa para registrar asistencia.');
      return;
    }

    if (estado === 'Pendiente') {
      return;
    }

    setRegistrando(true);
    setError('');
    setMensaje('');

    const registroBase = {
      materia_id: materia.id,
      fecha: sesion.fecha,
      hora_inicio: sesion.hora_inicio,
      alumno_id: alumno.id,
      estado,
      metodo,
      fecha_hora_registro: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase.from('asistencias').upsert(
      registroBase,
      {
        onConflict: 'materia_id,fecha,hora_inicio,alumno_id',
      }
    );

    if (upsertError) {
      setRegistrando(false);
      setError(`No fue posible registrar asistencia: ${upsertError.message}`);
      return;
    }

    if (metodo === 'Manual') {
      const { error: updateError } = await supabase
        .from('asistencias')
        .update({
          estado,
          metodo: 'Manual',
          fecha_hora_registro: new Date().toISOString(),
        })
        .eq('materia_id', materia.id)
        .eq('fecha', sesion.fecha)
        .eq('hora_inicio', sesion.hora_inicio)
        .eq('alumno_id', alumno.id);

      if (updateError) {
        setRegistrando(false);
        setError(`No fue posible ajustar la asistencia: ${updateError.message}`);
        return;
      }
    }

    await cargarDatosAsistencia();

    setRegistrando(false);
    setMensaje(`${alumno.nombre}: ${estado}`);
  }

  function volver() {
    if (!materiaId) {
      window.location.href = '/inicio';
      return;
    }

    window.location.href = `/materia?codigo=${encodeURIComponent(materiaId)}`;
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
          <p className="overline">Asistencia</p>

          <h1>
            {cargando
              ? 'Cargando...'
              : materia
                ? materia.nombre
                : 'Sesión no disponible'}
          </h1>

          {materia && (
            <p>
              {formatearFecha(fecha)} · {mostrarHora(hora)}
            </p>
          )}
        </section>

        {error && <div className="error-message">{error}</div>}
        {mensaje && <div className="success-message">{mensaje}</div>}

        {materia && sesion && (
          <>
            <section className="content-card">
              <form className="scan-form" onSubmit={registrarPorCodigo}>
                <label className="field">
                  <span>Escanear estudiante</span>

                  <input
                    type="text"
                    value={codigoLeido}
                    placeholder="Escanea o escribe el código"
                    onChange={(e) => setCodigoLeido(e.target.value)}
                    autoFocus
                    disabled={registrando}
                  />
                </label>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={registrando || cargando}
                >
                  {registrando ? 'Registrando...' : 'Registrar'}
                </button>
              </form>

              <div className="quick-actions">
                <button
                  type="button"
                  className="complete-button"
                  onClick={registrarAsistenciaCompleta}
                  disabled={registrando || cargando || resumen.pendiente === 0}
                >
                  Asistencia completa
                </button>

                <p>
                  Marca como presentes a todos los estudiantes que todavía están
                  pendientes.
                </p>
              </div>
            </section>

            <section className="summary-grid">
              <article>
                <span>Presente</span>
                <strong>{resumen.presente}</strong>
              </article>

              <article>
                <span>Tarde</span>
                <strong>{resumen.tarde}</strong>
              </article>

              <article>
                <span>Ausente</span>
                <strong>{resumen.ausente}</strong>
              </article>

              <article>
                <span>Pend.</span>
                <strong>{resumen.pendiente}</strong>
              </article>
            </section>

            <section className="content-card">
              <div className="section-header">
                <p className="section-label">Estudiantes</p>

                <button className="refresh-button" onClick={cargarDatosAsistencia}>
                  Actualizar
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
                  type="button"
                  className={orden === 'nombre' ? 'active' : ''}
                  onClick={() => setOrden('nombre')}
                >
                  Nombre
                </button>

                <button
                  type="button"
                  className={orden === 'apellido' ? 'active' : ''}
                  onClick={() => setOrden('apellido')}
                >
                  Apellido
                </button>

                <button
                  type="button"
                  className={orden === 'asistencia' ? 'active' : ''}
                  onClick={() => setOrden('asistencia')}
                >
                  Asistencia
                </button>
              </div>

              {cargando && <p className="empty-text">Cargando estudiantes...</p>}

              {!cargando && alumnosFiltrados.length === 0 && (
                <p className="empty-text">No hay estudiantes para mostrar.</p>
              )}

              <div className="student-list">
                {alumnosFiltrados.map((alumno) => (
                  <article
                    key={alumno.id}
                    className={claseFilaEstado(alumno.asistencia_estado)}
                  >
                    <div className="student-status-bar">
                      <span className={claseEstado(alumno.asistencia_estado)}>
                        {alumno.asistencia_estado}
                      </span>

                      <small>{textoMetodo(alumno)}</small>
                    </div>

                    <div className="student-heading">
                      <strong>{alumno.nombre}</strong>
                    </div>

                    <div className="manual-actions">
                      <button
                        type="button"
                        className="manual-button present"
                        disabled={registrando}
                        onClick={() =>
                          registrarAsistencia(alumno, 'Presente', 'Manual')
                        }
                      >
                        Presente
                      </button>

                      <button
                        type="button"
                        className="manual-button late"
                        disabled={registrando}
                        onClick={() =>
                          registrarAsistencia(alumno, 'Tarde', 'Manual')
                        }
                      >
                        Tarde
                      </button>

                      <button
                        type="button"
                        className="manual-button absent"
                        disabled={registrando}
                        onClick={() =>
                          registrarAsistencia(alumno, 'Ausente', 'Manual')
                        }
                      >
                        Ausente
                      </button>

                      <button
                        type="button"
                        className="manual-button justified"
                        disabled={registrando}
                        onClick={() =>
                          registrarAsistencia(alumno, 'Justificado', 'Manual')
                        }
                      >
                        Just.
                      </button>
                    </div>
                  </article>
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
    text-transform: capitalize;
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

  .content-card {
    background: #ffffff;
    border-radius: 24px;
    padding: 18px;
    box-shadow: 0 12px 38px rgba(0, 0, 0, 0.08);
    margin-bottom: 18px;
  }

  .scan-form {
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

  .quick-actions {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid #e5e7eb;
  }

  .complete-button {
    width: 100%;
    min-height: 48px;
    border: none;
    border-radius: 14px;
    background: #111111;
    color: #ffffff;
    font-size: 14px;
    font-weight: 900;
    cursor: pointer;
  }

  .complete-button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .quick-actions p {
    margin: 8px 0 0;
    color: #666666;
    font-size: 12px;
    line-height: 1.4;
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
    gap: 12px;
    margin-top: 14px;
  }

  .student-row {
    position: relative;
    border-radius: 18px;
    padding: 13px 12px 12px;
    border: 2px solid #e5e7eb;
    border-left-width: 9px;
    box-shadow: 0 10px 24px rgba(17, 17, 17, 0.08);
  }

  .student-row-pendiente {
    background: #fffbeb;
    border-color: #f59e0b;
  }

  .student-row-presente {
    background: #f0fdf4;
    border-color: #16a34a;
  }

  .student-row-tarde {
    background: #fff7ed;
    border-color: #f97316;
  }

  .student-row-ausente {
    background: #fef2f2;
    border-color: #dc2626;
  }

  .student-row-justificado {
    background: #eff6ff;
    border-color: #2563eb;
  }

  .student-status-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-bottom: 9px;
  }

  .student-status-bar small {
    color: #444444;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .student-heading {
    margin-bottom: 11px;
  }

  .student-heading strong {
    display: block;
    color: #111111;
    font-size: 15px;
    line-height: 1.2;
    font-weight: 900;
  }

  .status {
    border-radius: 999px;
    padding: 7px 10px;
    font-size: 10px;
    font-weight: 900;
    white-space: nowrap;
    text-transform: uppercase;
    letter-spacing: 0.35px;
  }

  .status.presente {
    background: #16a34a;
    color: #ffffff;
  }

  .status.tarde {
    background: #f97316;
    color: #ffffff;
  }

  .status.ausente {
    background: #dc2626;
    color: #ffffff;
  }

  .status.justificado {
    background: #2563eb;
    color: #ffffff;
  }

  .status.pendiente {
    background: #f59e0b;
    color: #111111;
  }

  .manual-actions {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }

  .manual-button {
    min-height: 34px;
    border: none;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 900;
    cursor: pointer;
    padding: 0 6px;
    box-shadow: 0 4px 10px rgba(17, 17, 17, 0.08);
  }

  .manual-button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .manual-button.present {
    background: #dcfce7;
    color: #166534;
  }

  .manual-button.late {
    background: #fef3c7;
    color: #92400e;
  }

  .manual-button.absent {
    background: #fee2e2;
    color: #991b1b;
  }

  .manual-button.justified {
    background: #dbeafe;
    color: #1e40af;
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

    .manual-actions {
      grid-template-columns: repeat(2, 1fr);
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
