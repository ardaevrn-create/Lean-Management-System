import { HttpException, HttpStatus } from '@nestjs/common';

/** İş kuralı ihlali: 422 + makine tarafından okunabilir kod. */
export class BusinessException extends HttpException {
  constructor(code: string, message: string, details?: unknown) {
    super({ statusCode: HttpStatus.UNPROCESSABLE_ENTITY, code, message, details }, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}
