import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FamilyTree } from './family-tree';

describe('FamilyTree', () => {
  let component: FamilyTree;
  let fixture: ComponentFixture<FamilyTree>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FamilyTree],
    }).compileComponents();

    fixture = TestBed.createComponent(FamilyTree);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
