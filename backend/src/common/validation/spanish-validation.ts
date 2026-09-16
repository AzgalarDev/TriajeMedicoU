import { BadRequestException, ValidationPipeOptions } from '@nestjs/common';
import { ValidationError } from 'class-validator';

const fieldLabels: Record<string, string> = {
  address: 'dirección',
  allergies: 'alergias',
  chronicConditions: 'enfermedades crónicas',
  currentMedications: 'medicación actual',
  dateOfBirth: 'fecha de nacimiento',
  description: 'descripción',
  fullName: 'nombre completo',
  medicalHistory: 'antecedentes médicos',
  name: 'nombre',
  nationalId: 'CI',
  newPassword: 'nueva contraseña',
  password: 'contraseña',
  passwordConfirmation: 'confirmación de contraseña',
  query: 'búsqueda',
  role: 'rol',
  severity: 'gravedad',
  sex: 'sexo',
  status: 'estado',
  symptoms: 'síntomas',
  username: 'usuario',
};

function fieldLabel(property: string): string {
  return fieldLabels[property] ?? property;
}

const constraintMessages: Record<string, (property: string, constraints?: Record<string, string>) => string> = {
  isString: (property) => `${property} debe ser texto`,
  minLength: (property) => `${property} no cumple con la longitud mínima requerida`,
  maxLength: (property) => `${property} excede la longitud máxima permitida`,
  isDateString: (property) => `${property} debe ser una fecha válida`,
  isIn: (property) => `${property} contiene un valor no permitido`,
  matches: (property) => `${property} tiene un formato inválido`,
  isArray: (property) => `${property} debe ser una lista`,
  nestedValidation: (property) => `${property} contiene datos inválidos`,
  whitelistValidation: (property) => `${property} no está permitido`,
};

function flattenValidationMessages(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => {
    const ownMessages = Object.keys(error.constraints ?? {}).map((constraint) => {
      const formatMessage = constraintMessages[constraint];
      const property = fieldLabel(error.property);
      return formatMessage ? formatMessage(property, error.constraints) : `${property} contiene datos inválidos`;
    });
    return [...ownMessages, ...flattenValidationMessages(error.children ?? [])];
  });
}

export function spanishValidationPipeOptions(): ValidationPipeOptions {
  return {
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => new BadRequestException(flattenValidationMessages(errors)),
  };
}
