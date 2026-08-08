export class EvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvaluationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ProviderError extends EvaluationError {
  public providerName: string;
  constructor(providerName: string, message: string) {
    super(`[Provider: ${providerName}] ${message}`);
    this.name = 'ProviderError';
    this.providerName = providerName;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends EvaluationError {
  constructor(message: string) {
    super(`[Validation] ${message}`);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class QualityGateError extends EvaluationError {
  constructor(message: string) {
    super(message);
    this.name = 'QualityGateError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class EvaluationRuntimeError extends EvaluationError {
  constructor(message: string) {
    super(message);
    this.name = 'EvaluationRuntimeError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
