/** Estado de envio por canal (e-mail ou SMS). */
export enum DeliveryChannelStatus {
  Pending = 'pending',
  Sent = 'sent',
  Failed = 'failed',
  Skipped = 'skipped',
}
