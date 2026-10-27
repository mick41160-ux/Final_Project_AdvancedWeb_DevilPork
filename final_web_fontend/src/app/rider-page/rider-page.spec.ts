import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RiderPage } from './rider-page';

describe('RiderPage', () => {
  let component: RiderPage;
  let fixture: ComponentFixture<RiderPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RiderPage],
    }).compileComponents();

    fixture = TestBed.createComponent(RiderPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
