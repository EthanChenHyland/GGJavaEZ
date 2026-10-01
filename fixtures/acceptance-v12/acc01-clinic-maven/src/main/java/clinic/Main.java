package clinic;

public class Main {
  public static void main(String[] args) {
    Clinic clinic = new Clinic(2);
    int revenue = clinic.operateDay();
    System.out.println("VISITS " + clinic.scheduler.totalVisits);
    System.out.println("REVENUE " + revenue);
    System.out.println("ISSUED " + Invoice.issued);
  }
}
