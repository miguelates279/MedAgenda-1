import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express from 'express';
import { AppModule } from './app.module';

const server = express();
let cachedServer: any;

async function bootstrap() {
  if (!cachedServer) {
    const app = await NestFactory.create(AppModule, new ExpressAdapter(server));
    app.enableCors({
      origin: true,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      credentials: true,
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    const swaggerConfig = new DocumentBuilder()
      .setTitle('MedAgenda API')
      .setDescription('Comprehensive API documentation for MedAgenda services.')
      .setVersion('1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          description: 'Provide the JWT token received after login.',
          in: 'header',
        },
        'bearer',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });

    await app.init();
    cachedServer = server;
  }
  return cachedServer;
}

// For local development
if (!process.env.VERCEL) {
  bootstrap().then(() => {
    const port = process.env.PORT ?? 3001;
    server.listen(port, () => {
      console.log(`Application is running on: http://localhost:${port}`);
    });
  });
}

// For Vercel serverless function export
export default async function handler(req: any, res: any) {
  const appServer = await bootstrap();
  return appServer(req, res);
}
