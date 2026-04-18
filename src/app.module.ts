import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule, type TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { CepModule } from './cep/cep.module';
import { CondominiumsModule } from './condominiums/condominiums.module';
import { resolveTypeOrmConnectionOptions } from './database/connection-credentials';
import { GroupingsModule } from './groupings/groupings.module';
import { PeopleModule } from './people/people.module';
import { FinanceModule } from './finance/finance.module';
import { CommunicationsModule } from './communications/communications.module';
import { PlanningModule } from './planning/planning.module';
import { StorageModule } from './storage/storage.module';
import { UnitsModule } from './units/units.module';
import { PlatformModule } from './platform/platform.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    StorageModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const get = (key: string) => config.get<string>(key);
        const connection = resolveTypeOrmConnectionOptions(get);
        const syncFlag = config.get<string>('DB_SYNCHRONIZE')?.toLowerCase();
        /** Só `true` se DB_SYNCHRONIZE=true (protótipo sem migrations). Nunca ligar em paralelo com migration:run. */
        const synchronize = syncFlag === 'true';

        return {
          ...(connection as TypeOrmModuleOptions),
          autoLoadEntities: true,
          synchronize,
        } as TypeOrmModuleOptions;
      },
    }),
    UsersModule,
    AuthModule,
    CepModule,
    CondominiumsModule,
    GroupingsModule,
    PeopleModule,
    UnitsModule,
    FinanceModule,
    PlanningModule,
    CommunicationsModule,
    PlatformModule,
  ],
})
export class AppModule {}
