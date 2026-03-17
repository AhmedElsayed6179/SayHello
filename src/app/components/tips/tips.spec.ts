import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Tips } from './tips';

describe('Tips', () => {
  let component: Tips;
  let fixture: ComponentFixture<Tips>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Tips]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Tips);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
