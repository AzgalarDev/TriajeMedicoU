import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { LoggingExceptionFilter } from './common/filters/logging-exception.filter';
import { spanishValidationPipeOptions } from './common/validation/spanish-validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.enableCors({ origin: 'http://localhost:5173', credentials: true });
  app.useGlobalPipes(new ValidationPipe(spanishValidationPipeOptions()));
  app.useGlobalFilters(new LoggingExceptionFilter());
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
