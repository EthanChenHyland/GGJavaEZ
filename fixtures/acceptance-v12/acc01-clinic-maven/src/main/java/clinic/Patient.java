package clinic;

public class Patient {
  final String fullName;
  final int ageYears;
  int visitCount;

  Patient(String fullName, int ageYears) {
    this.fullName = fullName;
    this.ageYears = ageYears;
  }

  void recordVisit() {
    visitCount++;
  }
}
