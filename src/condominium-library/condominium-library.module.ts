import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Person } from '../people/person.entity';
import { PlanningModule } from '../planning/planning.module';
import { User } from '../users/user.entity';
import { CondominiumLibraryController } from './condominium-library.controller';
import { CondominiumLibraryService } from './condominium-library.service';
import { CondominiumLibraryDocument } from './entities/condominium-library-document.entity';
import { CondominiumLibraryDocumentDownload } from './entities/condominium-library-document-download.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CondominiumLibraryDocument,
      CondominiumLibraryDocumentDownload,
      Person,
      User,
    ]),
    PlanningModule,
  ],
  controllers: [CondominiumLibraryController],
  providers: [CondominiumLibraryService],
  exports: [CondominiumLibraryService],
})
export class CondominiumLibraryModule {}
