import { Injectable, Logger } from '@nestjs/common';
import { config } from '../../config';

export interface MailMessage { to: string; subject: string; text: string }

/**
 * E-posta gönderimi. SMTP_URL tanımlı değilse (geliştirme) mesajlar log'a yazılır.
 * TODO(Faz 1 sonu): nodemailer / transactional mail sağlayıcısı entegrasyonu.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async send(message: MailMessage): Promise<boolean> {
    if (!config.smtpUrl) {
      this.logger.debug(`[mail:dev] to=${message.to} subject="${message.subject}"`);
      return false;
    }
    this.logger.warn('SMTP transport not implemented yet');
    return false;
  }
}
