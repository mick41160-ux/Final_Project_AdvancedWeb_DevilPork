import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Porp } from './porp';

describe('Porp', () => {
  let component: Porp;
  let fixture: ComponentFixture<Porp>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Porp],
    }).compileComponents();

    fixture = TestBed.createComponent(Porp);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
