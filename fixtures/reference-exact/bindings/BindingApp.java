import java.util.LinkedHashMap;
import java.util.Map;

public class BindingApp {
    public static void main(String[] args) {
        BindingNode a = new BindingNode(1);
        BindingNode b = new BindingNode(2);
        BindingNode selected = a;
        selected = b;
        selected = null;
        a.next = b;
        a.next = a;
        a.next = null;
        for (int index = 0; index < 72; index++) {
            if (index % 2 == 0) a.next = a;
            else a.next = b;
        }
        a.next = null;
        BindingNode[] slots = {a, b};
        slots[0] = b;
        slots[0] = null;
        Map<BindingNode, BindingNode> pairs = new LinkedHashMap<>();
        pairs.put(a, b);
        pairs.put(a, a);
        pairs.put(a, null);
        System.out.println("BINDINGS DONE");
    }
}

class BindingNode {
    BindingNode next;
    int value;
    BindingNode(int value) { this.value = value; }
}
