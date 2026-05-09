import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RoadSafetyQuiz } from './road-safety-quiz';

describe('RoadSafetyQuiz', () => {
  let component: RoadSafetyQuiz;
  let fixture: ComponentFixture<RoadSafetyQuiz>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoadSafetyQuiz],
    }).compileComponents();

    fixture = TestBed.createComponent(RoadSafetyQuiz);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
