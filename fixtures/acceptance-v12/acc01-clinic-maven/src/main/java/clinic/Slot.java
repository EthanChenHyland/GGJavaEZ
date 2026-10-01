package clinic;

public class Slot {
  int hourOfDay;
  final Doctor doctor;
  final Patient patient;

  Slot(int hourOfDay, Doctor doctor, Patient patient) {
    this.hourOfDay = hourOfDay;
    this.doctor = doctor;
    this.patient = patient;
  }
}
