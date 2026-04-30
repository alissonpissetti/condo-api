import { Module } from '@nestjs/common';
import { TwilioWhatsappService } from './twilio-whatsapp.service';

@Module({
  providers: [TwilioWhatsappService],
  exports: [TwilioWhatsappService],
})
export class TwilioWhatsappModule {}
