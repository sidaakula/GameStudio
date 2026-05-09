import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RobotGame } from './robot-game';

describe('RobotGame', () => {
  let component: RobotGame;
  let fixture: ComponentFixture<RobotGame>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RobotGame],
    }).compileComponents();

    fixture = TestBed.createComponent(RobotGame);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
