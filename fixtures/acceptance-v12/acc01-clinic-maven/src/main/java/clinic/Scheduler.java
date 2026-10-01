package clinic;

public class Scheduler {
  int totalVisits;
  Slot latestSlot;

  Slot bookVisit(Doctor doctor, Patient patient, int hour) {
    if (!doctor.acceptVisit()) return null;
    Slot booked = new Slot(hour, doctor, patient);
    patient.recordVisit();
    totalVisits = totalVisits + 1;
    latestSlot = booked;
    return booked;
  }

  void reschedule(Slot slot, int newHour) {
    slot.hourOfDay = newHour;
  }

  Invoice billFor(Slot slot) {
    int fee = slot.doctor.visitFee(slot.hourOfDay);
    Invoice invoice = new Invoice(slot.patient, fee);
    return invoice;
  }
}
