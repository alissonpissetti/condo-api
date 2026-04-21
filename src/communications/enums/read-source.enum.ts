export enum CommunicationReadSource {
  App = 'app',
  /** Links antigos (antes de tokens por canal/unidade). */
  EmailToken = 'email_token',
  /** Confirmação pelo link do e-mail (token específico da unidade e do canal). */
  EmailLink = 'email_link',
  /** Confirmação pelo link enviado por SMS. */
  SmsLink = 'sms_link',
  /** Confirmação pelo link enviado por WhatsApp. */
  WhatsappLink = 'whatsapp_link',
}
