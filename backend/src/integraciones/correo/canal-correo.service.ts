import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from '../../config/env.js';
import type { CanalNotificacion, Mensaje } from './canal-notificacion.js';

/** Adaptador de correo (SMTP). En desarrollo apunta a Mailpit. */
@Injectable()
export class CanalCorreo implements CanalNotificacion {
  private readonly logger = new Logger(CanalCorreo.name);
  private readonly transporte: Transporter;
  private readonly remitente: string;

  constructor(config: ConfigService<Env, true>) {
    const usuario = config.get('SMTP_USER', { infer: true });
    this.remitente = config.get('SMTP_FROM', { infer: true });
    this.transporte = nodemailer.createTransport({
      host: config.get('SMTP_HOST', { infer: true }),
      port: config.get('SMTP_PORT', { infer: true }),
      secure: config.get('SMTP_SECURE', { infer: true }),
      ...(usuario ? { auth: { user: usuario, pass: config.get('SMTP_PASS', { infer: true }) } } : {}),
    });
  }

  async enviar(mensaje: Mensaje): Promise<void> {
    await this.transporte.sendMail({
      from: this.remitente,
      to: mensaje.destinatario,
      subject: mensaje.asunto,
      html: mensaje.html,
      text: mensaje.texto,
      attachments: mensaje.adjuntos?.map((a) => ({
        filename: a.nombre,
        content: a.contenido,
        contentType: a.tipo,
        cid: a.cid,
      })),
    });
    this.logger.debug(`Correo enviado a ${mensaje.destinatario}: ${mensaje.asunto}`);
  }
}
