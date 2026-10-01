package clinic;

public class Clinic {
  final Scheduler scheduler;
  final Doctor cardiologist;
  final Doctor dermatologist;

  Clinic(int capacity) {
    this.scheduler = new Scheduler();
    this.cardiologist = new Doctor("cardiology", capacity);
    this.dermatologist = new Doctor("dermatology", capacity + 1);
  }

  int operateDay() {
    Patient ada = new Patient("Ada Quill", 41);
    Patient bo = new Patient("Bo Marsh", 29);
    Slot first = scheduler.bookVisit(cardiologist, ada, 9);
    Slot second = scheduler.bookVisit(dermatologist, bo, 10);
    scheduler.reschedule(second, 14);
    Invoice firstBill = scheduler.billFor(first);
    Invoice secondBill = scheduler.billFor(second);
    int total = firstBill.cents + secondBill.cents;
    return total;
  }
}
