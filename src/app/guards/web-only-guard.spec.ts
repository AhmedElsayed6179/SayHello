import { TestBed } from '@angular/core/testing';
import { CanActivateFn } from '@angular/router';

import { webOnlyGuard } from './web-only-guard';

describe('webOnlyGuard', () => {
  const executeGuard: CanActivateFn = (...guardParameters) => 
      TestBed.runInInjectionContext(() => webOnlyGuard(...guardParameters));

  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('should be created', () => {
    expect(executeGuard).toBeTruthy();
  });
});
