import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, type TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { CepModule } from './cep/cep.module';
import { CondominiumsModule } from './condominiums/condominiums.module';
import { resolveTypeOrmConnectionOptions } from './database/connection-credentials';
import { GroupingsModule } from './groupings/groupings.module';
import { PeopleModule } from './people/people.module';
import { FinanceModule } from './finance/finance.module';
import { UnitsModule } from './units/units.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const get = (key: string) => config.get<string>(key);
        const connection = resolveTypeOrmConnectionOptions(get);
        const isDev = config.get<string>('NODE_ENV') !== 'production';
        const syncFlag = config.get<string>('DB_SYNCHRONIZE')?.toLowerCase();
        const synchronize =
          syncFlag === 'false' ? false : syncFlag === 'true' ? true : isDev;

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
  ],
})
export class AppModule {}
