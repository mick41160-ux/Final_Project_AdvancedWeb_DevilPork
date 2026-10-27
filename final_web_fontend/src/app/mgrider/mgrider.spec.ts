import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Mgrider } from './mgrider';


describe('Mgrider', () => {
  let component: Mgrider;
  let fixture: ComponentFixture<Mgrider>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Mgrider],
    }).compileComponents();

    fixture = TestBed.createComponent(Mgrider);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
