'use client';

import { useEffect, useMemo, useState } from 'react';
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

function primerNombre(nombre: string) {
  return nombre.trim().split(/\s+/)[0] || nombre;
}

export default function InicioPage() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [rol, setRol] = useState<RolUsuario>('Profesor');

  const [materias, setMaterias] = useState<Materia[]>([]);

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    cargarPagina();
  }, []);

  const totalMaterias = materias.length;

  const tituloMaterias = useMemo(() => {
    if (rol === 'Administrador') return 'Materias activas';
    if (rol === 'Coordinador') return 'Materias asignadas';
    return 'Mis materias';
  }, [rol]);

  const textoBotonReportes = useMemo(() => {
    if (rol === 'Profesor') return 'Ver reportes de mis materias';
    return 'Ir a reportes';
  }, [rol]);

  const tituloReportes = useMemo(() => {
    if (rol === 'Profesor') return 'Reporte por materia';
    return 'Consultar reportes';
  }, [rol]);

  const totalReportes = rol === 'Profesor' ? 1 : 3;

  async function cargarPagina() {
    setCargando(true);
    setError('');

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

    const materiasVisibles = await cargarMateriasVisibles(
      usuarioData.id,
      rolDetectado
    );

    setMaterias(materiasVisibles);
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

  async function cargarMateriasVisibles(
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

      const materiaIdsCoordinadas = (asignaciones || []).map(
        (item) => item.materia_id
      );

      const { data: materiasPropias, error: propiasError } = await supabase
        .from('materias')
        .select('id, codigo, nombre, periodo_id, profesor_id, estado')
        .eq('profesor_id', profesorId)
        .eq('estado', true)
        .order('periodo_id', { ascending: false })
        .order('nombre', { ascending: true });

      if (propiasError) {
        setError(`No fue posible cargar tus materias: ${propiasError.message}`);
        return [];
      }

      let materiasCoordinadas: Materia[] = [];

      if (materiaIdsCoordinadas.length > 0) {
        const { data, error } = await supabase
          .from('materias')
          .select('id, codigo, nombre, periodo_id, profesor_id, estado')
          .in('id', materiaIdsCoordinadas)
          .eq('estado', true)
          .order('periodo_id', { ascending: false })
          .order('nombre', { ascending: true });

        if (error) {
          setError(`No fue posible cargar materias coordinadas: ${error.message}`);
          return [];
        }

        materiasCoordinadas = data || [];
      }

      const mapa = new Map<string, Materia>();

      [...materiasCoordinadas, ...(materiasPropias || [])].forEach((materia) => {
        mapa.set(materia.id, materia);
      });

      return Array.from(mapa.values()).sort((a, b) => {
        if (a.periodo_id !== b.periodo_id) {
          return b.periodo_id.localeCompare(a.periodo_id);
        }

        return a.nombre.localeCompare(b.nombre);
      });
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

  function abrirMateria(materiaId: string) {
    window.location.href = `/materia?codigo=${encodeURIComponent(materiaId)}`;
  }

  function irA(ruta: string) {
    window.location.href = ruta;
  }

  function irAReportes() {
    if (rol === 'Profesor') {
      window.location.href = '/reportes/materias';
      return;
    }

    window.location.href = '/reportes';
  }

  async function cerrarSesion() {
    await supabase.auth.signOut();
    window.location.href = '/auth';
  }

  return (
    <main className="page">
      <section className="shell">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark">ECI</div>

            <div>
              <p className="brand-name">Asistencia de Estudiantes</p>
              <p className="brand-subtitle">Escuela Colombiana de Ingeniería</p>
            </div>
          </div>

          <button className="logout-button" onClick={cerrarSesion}>
            Salir
          </button>
        </header>

        <section className="hero">
          <p className="overline">Inicio</p>

          <h1>
            {cargando
              ? 'Cargando...'
              : usuario
                ? `Hola, ${primerNombre(usuario.nombre)}`
                : 'Hola'}
          </h1>

          <p>{rol}</p>
        </section>

        {error && <div className="error-message">{error}</div>}

        {rol === 'Administrador' && (
          <section className="content-card">
            <div className="section-header">
              <p className="section-label">Administración</p>
            </div>

            <div className="admin-grid">
              <button onClick={() => irA('/gestion/periodos')}>
                <span>📅</span>
                Periodos
              </button>

              <button onClick={() => irA('/gestion/profesores')}>
                <span>👨‍🏫</span>
                Profesores
              </button>

              <button onClick={() => irA('/gestion/alumnos')}>
                <span>🎓</span>
                Estudiantes
              </button>

              <button onClick={() => irA('/gestion/materias')}>
                <span>📚</span>
                Materias
              </button>

              <button onClick={() => irA('/gestion/inscritos')}>
                <span>📝</span>
                Inscritos
              </button>

              <button onClick={() => irA('/gestion/coordinador-materias')}>
                <span>🧭</span>
                Coord. materias
              </button>
            </div>
          </section>
        )}

        <section className="summary-grid">
          <article>
            <span>Materias</span>
            <strong>{totalMaterias}</strong>
          </article>

          <article>
            <span>Reportes</span>
            <strong>{totalReportes}</strong>
          </article>
        </section>

        <section className="content-card">
          <div className="section-header">
            <p className="section-label">{tituloMaterias}</p>

            <button className="refresh-button" onClick={cargarPagina}>
              Actualizar
            </button>
          </div>

          {cargando && <p className="empty-text">Cargando materias...</p>}

          {!cargando && materias.length === 0 && (
            <p className="empty-text">No hay materias para mostrar.</p>
          )}

          <div className="matter-list">
            {materias.map((materia) => (
              <article key={materia.id} className="matter-row">
                <div className="matter-main">
                  <strong>{materia.nombre}</strong>

                  <span>
                    {materia.codigo} · {materia.periodo_id}
                  </span>
                </div>

                <button
                  className="open-button"
                  onClick={() => abrirMateria(materia.id)}
                >
                  Abrir
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="content-card reports-card bottom-reports-card">
          <div className="report-icon">📊</div>

          <div className="report-copy">
            <p className="section-label">Reportes</p>
            <h2>{tituloReportes}</h2>
          </div>

          <button className="primary-button" onClick={irAReportes}>
            {textoBotonReportes}
          </button>
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
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    color: #ffffff;
    padding: 6px 0 22px;
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

  .logout-button {
    border: none;
    border-radius: 999px;
    background: #ffffff;
    color: #111111;
    font-size: 12px;
    font-weight: 900;
    padding: 10px 13px;
    cursor: pointer;
    flex-shrink: 0;
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

  .hero p:last-child {
    margin: 10px 0 0;
    color: #d1d5db;
    font-size: 13px;
    font-weight: 800;
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

  .admin-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .admin-grid button {
    min-height: 72px;
    border: none;
    border-radius: 18px;
    background: #f4f4f4;
    color: #111111;
    font-size: 13px;
    font-weight: 900;
    cursor: pointer;
    padding: 10px;
    text-align: left;
  }

  .admin-grid span {
    display: block;
    font-size: 22px;
    margin-bottom: 6px;
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

  .matter-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .matter-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 10px;
    align-items: center;
    border: 1px solid #e5e7eb;
    border-radius: 15px;
    background: #fafafa;
    padding: 10px;
  }

  .matter-main {
    min-width: 0;
  }

  .matter-main strong {
    display: block;
    color: #111111;
    font-size: 14px;
    line-height: 1.2;
    font-weight: 900;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .matter-main span {
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

  .reports-card {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 14px;
    align-items: center;
    border-left: 6px solid #c8102e;
  }

  .bottom-reports-card {
    margin-top: 4px;
  }

  .report-icon {
    width: 54px;
    height: 54px;
    border-radius: 18px;
    background: #f4f4f4;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
  }

  .report-copy h2 {
    margin: 5px 0 0;
    font-size: 20px;
    line-height: 1.1;
    font-weight: 900;
  }

  .reports-card .primary-button {
    grid-column: 1 / -1;
  }

  .primary-button {
    width: 100%;
    height: 48px;
    border: none;
    border-radius: 14px;
    background: #c8102e;
    color: #ffffff;
    font-size: 14px;
    font-weight: 900;
    cursor: pointer;
    box-shadow: 0 10px 22px rgba(200, 16, 46, 0.24);
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

  .footer-note {
    color: #666666;
    text-align: center;
    font-size: 12px;
    line-height: 1.4;
    margin: 18px 0 0;
  }

  @media (max-width: 390px) {
    .brand-name {
      font-size: 12px;
    }

    .brand-subtitle {
      font-size: 10px;
    }

    .hero h1 {
      font-size: 34px;
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