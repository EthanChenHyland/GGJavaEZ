package audit.dispatch;

import audit.dispatch.model.Delivery;
import audit.dispatch.model.ExpressDelivery;
import audit.dispatch.model.ParcelDelivery;
import audit.dispatch.service.DispatchService;
import com.google.gson.Gson;
import java.util.ArrayList;
import java.util.List;

public final class Main {
    public static void main(String[] args) {
        List<Delivery> deliveries = new ArrayList<>();
        deliveries.add(new ParcelDelivery(3));
        deliveries.add(new ExpressDelivery(2));
        DispatchService service = new DispatchService();
        System.out.println("TOTAL " + service.total(deliveries));
        System.out.println(new Gson().toJson(service.describe(deliveries)));
    }
}
