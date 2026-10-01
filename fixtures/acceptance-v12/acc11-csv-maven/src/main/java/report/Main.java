package report;

import java.io.IOException;
import java.io.StringReader;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;

public class Main {
  public static void main(String[] args) throws IOException {
    String sheet = "region,amount\nnorth,120\nsouth,75\nnorth,30\neast,55\nsouth,25\n";
    RegionTotals totals = new RegionTotals();
    CSVFormat format = CSVFormat.DEFAULT.builder().setHeader().setSkipHeaderRecord(true).build();
    try (CSVParser parser = CSVParser.parse(new StringReader(sheet), format)) {
      for (CSVRecord row : parser) {
        totals.accumulate(row.get("region"), Integer.parseInt(row.get("amount")));
      }
    }
    System.out.println("NORTH " + totals.north.amount);
    System.out.println("SOUTH " + totals.south.amount);
    System.out.println("OTHER " + totals.other.amount);
    System.out.println("ROWS " + totals.rowsSeen);
  }
}
