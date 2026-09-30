package audit.dispatch.service;

import audit.dispatch.model.Delivery;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class DispatchService {
    public List<Map<String, Object>> describe(List<Delivery> deliveries) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Delivery delivery : deliveries) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("kind", delivery.kind());
            row.put("charge", delivery.charge());
            rows.add(row);
        }
        return rows;
    }

    public int total(List<Delivery> deliveries) {
        int result = 0;
        for (Delivery delivery : deliveries) result += delivery.charge();
        return result;
    }
}
