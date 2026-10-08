import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RiderComponent } from './rider';

describe('RiderComponent', () => {
  let component: RiderComponent;
  let fixture: ComponentFixture<RiderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RiderComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RiderComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
