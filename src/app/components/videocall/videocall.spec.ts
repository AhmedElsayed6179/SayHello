import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Videocall } from './videocall';

describe('Videocall', () => {
  let component: Videocall;
  let fixture: ComponentFixture<Videocall>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Videocall]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Videocall);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
