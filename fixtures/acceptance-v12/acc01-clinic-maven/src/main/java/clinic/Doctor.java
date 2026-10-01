package clinic;

public class Doctor {
  final String specialty;
  final int dailyCapacity;
  int bookedVisits;

  Doctor(String specialty, int dailyCapacity) {
    this.specialty = specialty;
    this.dailyCapacity = dailyCapacity;
  }

  boolean acceptVisit() {
    if (bookedVisits >= dailyCapacity) return false;
    bookedVisits = bookedVisits + 1;
    return true;
  }

  int visitFee(int hour) {
    int base = specialty.length() * 1000;
    if (hour >= 12) base = base + 1500;
    return base;
  }
}
