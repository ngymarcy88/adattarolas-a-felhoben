import { HealthController } from '../src/health/health.controller';

describe('HealthController', () => {
  it('returns minimal liveness information without dependency details', () => {
    expect(new HealthController().getHealth()).toEqual({ status: 'ok' });
  });
});
