/**
 * Plantillas de correo del VMS. HTML sencillo compatible con clientes de correo.
 */

function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

function formatearFecha(fecha: Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(fecha);
}

function base(titulo: string, cuerpo: string): string {
  return `<!doctype html>
<html lang="es"><body style="margin:0;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;color:#111827">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.05);max-width:560px;width:100%">
        <tr><td style="padding:24px 32px;border-bottom:1px solid #e5e7eb">
          <span style="display:inline-block;width:28px;height:28px;line-height:28px;text-align:center;border-radius:6px;background:#4f46e5;color:#fff;font-weight:bold">V</span>
          <span style="margin-left:8px;font-weight:600">VMS · Planta Textil</span>
        </td></tr>
        <tr><td style="padding:32px">
          <h1 style="margin:0 0 16px;font-size:20px">${titulo}</h1>
          ${cuerpo}
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280">
          Este mensaje fue generado por el Sistema de Gestión de Visitantes. Sus datos personales se tratan según la Ley 1581 de 2012.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function boton(texto: string, url: string): string {
  return `<p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600">${escapar(texto)}</a></p>`;
}

export interface DatosEnlacePreRegistro {
  nombreVisitante: string;
  nombreAnfitrion: string;
  fechaVisita: Date;
  motivo: string;
  enlace: string;
  vencimiento: Date;
}

export function correoEnlacePreRegistro(d: DatosEnlacePreRegistro): { asunto: string; html: string; texto: string } {
  const asunto = `Invitación a la planta · ${formatearFecha(d.fechaVisita)}`;
  const html = base(
    `Hola, ${escapar(d.nombreVisitante)}`,
    `<p><strong>${escapar(d.nombreAnfitrion)}</strong> le ha invitado a una visita a la planta.</p>
     <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:14px">
       <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Fecha</td><td>${escapar(formatearFecha(d.fechaVisita))}</td></tr>
       <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Motivo</td><td>${escapar(d.motivo)}</td></tr>
     </table>
     <p>Complete su pre-registro antes de llegar: toma menos de 5 minutos e incluye el consentimiento de datos y la inducción de seguridad.</p>
     ${boton('Completar pre-registro', d.enlace)}
     <p style="font-size:12px;color:#6b7280">El enlace es personal y vence el ${escapar(formatearFecha(d.vencimiento))}. Si el botón no funciona, copie esta dirección:<br>${escapar(d.enlace)}</p>`,
  );
  const texto = `${d.nombreAnfitrion} le ha invitado a una visita a la planta el ${formatearFecha(d.fechaVisita)} (${d.motivo}). Complete su pre-registro en ${d.enlace} (vence el ${formatearFecha(d.vencimiento)}).`;
  return { asunto, html, texto };
}

export interface DatosCredencial {
  nombreVisitante: string;
  empresa: string;
  fechaVisita: Date;
  venceEn: Date;
  enlaceCredencial: string;
}

export function correoCredencial(d: DatosCredencial): { asunto: string; html: string; texto: string } {
  const asunto = 'Su credencial de ingreso a la planta';
  const html = base(
    'Pre-registro completado',
    `<p>${escapar(d.nombreVisitante)} · ${escapar(d.empresa)}</p>
     <p>Presente este código QR en recepción el día de su visita (${escapar(formatearFecha(d.fechaVisita))}) junto con su documento de identidad.</p>
     <p style="text-align:center;margin:24px 0"><img src="cid:credencial-qr" alt="Código QR de ingreso" width="220" height="220" style="border:1px solid #e5e7eb;border-radius:8px;padding:8px"></p>
     <p style="font-size:14px"><strong>Recuerde:</strong> use el EPP exigido en planta y regístrese al salir. La credencial vence el ${escapar(formatearFecha(d.venceEn))}.</p>
     ${boton('Ver mi credencial', d.enlaceCredencial)}`,
  );
  const texto = `Pre-registro completado. Presente el código QR adjunto en recepción el ${formatearFecha(d.fechaVisita)}. También puede verlo en ${d.enlaceCredencial}.`;
  return { asunto, html, texto };
}

export interface DatosCambioInvitacion {
  nombreVisitante: string;
  nombreAnfitrion: string;
  tipo: 'REPROGRAMADA' | 'CANCELADA';
  fechaVisita: Date;
  enlace?: string;
}

export function correoCambioInvitacion(d: DatosCambioInvitacion): { asunto: string; html: string; texto: string } {
  if (d.tipo === 'CANCELADA') {
    return {
      asunto: 'Su visita a la planta fue cancelada',
      html: base(
        'Visita cancelada',
        `<p>${escapar(d.nombreAnfitrion)} canceló la visita programada para el ${escapar(formatearFecha(d.fechaVisita))}. Cualquier credencial emitida quedó sin efecto.</p>`,
      ),
      texto: `La visita del ${formatearFecha(d.fechaVisita)} fue cancelada por ${d.nombreAnfitrion}.`,
    };
  }
  return {
    asunto: 'Su visita a la planta fue reprogramada',
    html: base(
      'Visita reprogramada',
      `<p>${escapar(d.nombreAnfitrion)} reprogramó su visita para el <strong>${escapar(formatearFecha(d.fechaVisita))}</strong>. La credencial anterior quedó sin efecto.</p>
       ${d.enlace ? boton('Obtener nueva credencial', d.enlace) : ''}`,
    ),
    texto: `Su visita fue reprogramada para el ${formatearFecha(d.fechaVisita)}.${d.enlace ? ` Obtenga su nueva credencial en ${d.enlace}` : ''}`,
  };
}

export interface DatosAviso {
  asunto: string;
  titulo: string;
  /** Párrafo introductorio */
  introduccion: string;
  /** Pares etiqueta/valor que se muestran en tabla */
  datos: { etiqueta: string; valor: string }[];
  /** Instrucción final para el destinatario */
  accion?: string;
  tono?: 'info' | 'alerta';
}

/** Aviso interno (anfitrión, Seguridad, DPO) con datos tabulados. */
export function correoAviso(d: DatosAviso): { asunto: string; html: string; texto: string } {
  const color = d.tono === 'alerta' ? '#b91c1c' : '#1f2937';
  const filas = d.datos
    .map((f) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;white-space:nowrap">${escapar(f.etiqueta)}</td><td>${escapar(f.valor)}</td></tr>`)
    .join('');
  const html = base(
    `<span style="color:${color}">${escapar(d.titulo)}</span>`,
    `<p>${escapar(d.introduccion)}</p>
     <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:14px">${filas}</table>
     ${d.accion ? `<p style="font-weight:600">${escapar(d.accion)}</p>` : ''}`,
  );
  const texto = `${d.titulo}\n${d.introduccion}\n${d.datos.map((f) => `${f.etiqueta}: ${f.valor}`).join('\n')}${d.accion ? `\n${d.accion}` : ''}`;
  return { asunto: d.asunto, html, texto };
}

export function correoBienvenidaUsuario(d: { nombre: string; correo: string; contrasenaTemporal: string; enlaceAcceso: string }): { asunto: string; html: string } {
  const html = base(
    `Hola, ${escapar(d.nombre)}`,
    `<p>Tiene una cuenta en el Sistema de Gestión de Visitantes.</p>
     <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:14px">
       <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Usuario</td><td>${escapar(d.correo)}</td></tr>
       <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Contraseña temporal</td><td><code data-contrasena="${escapar(d.contrasenaTemporal)}">${escapar(d.contrasenaTemporal)}</code></td></tr>
     </table>
     ${boton('Iniciar sesión', d.enlaceAcceso)}
     <p style="font-size:12px;color:#6b7280">No comparta esta contraseña.</p>`,
  );
  return { asunto: 'Su cuenta en el Sistema de Gestión de Visitantes', html };
}

export function correoEncuesta(d: { nombreVisitante: string; enlace: string }): { asunto: string; html: string; texto: string } {
  const html = base(`Gracias por su visita, ${escapar(d.nombreVisitante)}`, `<p>¿Cómo fue su experiencia en la planta? Responder toma menos de un minuto.</p>${boton('Responder la encuesta', d.enlace)}`);
  return { asunto: 'Cuéntenos cómo fue su visita', html, texto: 'Gracias por su visita. Responda la encuesta en el enlace recibido.' };
}

export function correoReenvio(asunto: string, mensaje: string): string {
  return base(escapar(asunto), `<p style="white-space:pre-line">${escapar(mensaje)}</p>`);
}

export function formatearFechaHoraCorreo(fecha: Date): string {
  return formatearFecha(fecha);
}
