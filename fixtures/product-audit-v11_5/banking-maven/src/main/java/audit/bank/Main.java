package audit.bank;

import com.google.gson.Gson;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

public final class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader input = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        String line = input.readLine();
        if (line == null) throw new IllegalArgumentException("expected: owner deposit withdrawal");
        String[] fields = line.trim().split("\\s+");
        if (fields.length != 3) throw new IllegalArgumentException("expected: owner deposit withdrawal");

        Receipt receipt = new LedgerService().post(
            fields[0], Integer.parseInt(fields[1]), Integer.parseInt(fields[2]));
        Map<String, Object> json = new LinkedHashMap<>();
        json.put("owner", receipt.owner());
        json.put("opening", receipt.opening());
        json.put("deposit", receipt.deposit());
        json.put("withdrawal", receipt.withdrawal());
        json.put("closing", receipt.closing());

        System.out.println("BALANCE " + receipt.closing());
        System.out.println(new Gson().toJson(json));
    }
}
